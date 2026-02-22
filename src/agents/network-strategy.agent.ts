import {
  AgentResult,
  CostModelResult,
  HubModelRecommendation,
  HubProfitabilityResult,
  VolumeForecast,
} from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const PROFITABILITY_SYSTEM_PROMPT = `You are a logistics network strategy expert for RedX, a courier company in Bangladesh.
You will receive hub operational data, volume forecasts, cost/margin analysis, and a PRE-CALCULATED
projected 90-day margin. Use the pre-calculated value exactly — do not recompute it.
Recommend whether to keep, close, or convert this hub to 4PL-only.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "recommendation": "keep" | "close" | "convert",
  "risk_score": <0-100>,
  "reasoning": "<brief explanation>"
}`;

const MODEL_ADVISOR_SYSTEM_PROMPT = `You are a hub model optimization advisor for RedX, a courier company in Bangladesh.
You will receive hub performance data and cost scenarios for 3PL-only, 4PL-only, and Hybrid models.
Recommend the optimal operating model for this hub.

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "recommended_model": "3PL" | "4PL" | "Hybrid",
  "margin_uplift": <number in BDT per parcel vs current>,
  "risk_score": <0-100>,
  "confidence": <0-100>,
  "projected_profitability_90d": <number in BDT>,
  "reasoning": "<brief explanation>"
}`;

interface HubAggregate {
  hub_id: number;
  hub_name: string;
  total_parcels: number;
  fourpl_parcels: number;
  fourpl_ratio: number;
  total_revenue: number;
}

async function fetchHubAggregate(hubId: number): Promise<HubAggregate | null> {
  const rows = await query<HubAggregate[]>(
    `SELECT
       r.HUB_ID                                              AS hub_id,
       h.HUB_NAME                                           AS hub_name,
       COUNT(*)                                              AS total_parcels,
       SUM(CASE WHEN p.PARTNER_ID IS NOT NULL THEN 1 ELSE 0 END) AS fourpl_parcels,
       ROUND(
         SUM(CASE WHEN p.PARTNER_ID IS NOT NULL THEN 1 ELSE 0 END)
         * 100.0 / COUNT(*), 2
       )                                                     AS fourpl_ratio,
       SUM(
         CASE
           WHEN p.STATUS IN (
             'delivered','cash-received','delivery-payment-collected',
             'delivery-payment-sent','hub-payment-collected'
           ) THEN COALESCE(p.SHOPUP_CHARGE, 0) + COALESCE(p.SHOPUP_COD_CHARGE, 0)
           WHEN p.STATUS IN ('shopup-returning', 'shopup-returned')
             THEN COALESCE(p.SHOPUP_RETURN_CHARGE, 0)
           ELSE 0
         END
       )                                                     AS total_revenue
     FROM sl_parcels p
     JOIN sl_logistics_parcel_routes r
       ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
     JOIN sl_hubs h ON h.ID = r.HUB_ID
     WHERE r.HUB_ID = ?
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY r.HUB_ID, h.HUB_NAME`,
    [hubId]
  );
  return rows[0] ?? null;
}

interface HubConfig {
  hub_id: number;
  hub_name: string;
  hub_type: string;
  is_mh: boolean;
  is_rmh: boolean;
  sla_tier: string | null;
  sla_target: number | null;
}

async function fetchHubConfig(hubId: number): Promise<HubConfig | null> {
  const rows = await query<HubConfig[]>(
    `SELECT
       ID          AS hub_id,
       HUB_NAME    AS hub_name,
       HUB_TYPE    AS hub_type,
       IS_MH       AS is_mh,
       IS_RMH      AS is_rmh,
       SLA_TIER    AS sla_tier,
       SLA_TARGET  AS sla_target
     FROM sl_hubs
     WHERE ID = ?`,
    [hubId]
  );
  return rows[0] ?? null;
}

async function fetchHubAreas(hubId: number): Promise<{ area_id: number; status: string }[]> {
  return query<{ area_id: number; status: string }[]>(
    `SELECT AREA_ID AS area_id, STATUS AS status FROM sl_area_hub WHERE HUB_ID = ? ORDER BY STATUS`,
    [hubId]
  );
}

async function fetchHubMonthlyCosts(hubId: number) {
  const rows = await query<Array<{
    total_fixed_cost: number;
  }>>(
    `SELECT
       COALESCE(SUM(rent + employee_cost + utility_cost + maintenance_cost + other_cost), 0)
         AS total_fixed_cost
     FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = YEAR(NOW()) AND month = MONTH(NOW())`,
    [hubId]
  );
  return rows[0]?.total_fixed_cost ?? 0;
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0, inString = false, escape = false, end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    else if (ch === closeChar && --depth === 0) { end = i; break; }
  }
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export async function runNetworkStrategyAgent(
  hubId: number,
  volumeForecast: VolumeForecast,
  costModels: CostModelResult[]
): Promise<AgentResult<HubProfitabilityResult>> {
  const [aggregate, hubConfig, totalFixedCost, hubAreas] = await Promise.all([
    fetchHubAggregate(hubId),
    fetchHubConfig(hubId),
    fetchHubMonthlyCosts(hubId),
    fetchHubAreas(hubId),
  ]);

  const activeAreas = hubAreas.filter(a => a.status === 'active').length;

  // Pre-compute projected 90-day margin in code to avoid Claude inconsistency:
  // revenue = forecast volume × avg revenue per parcel; deduct fixed costs × 3 months
  const avgRevenuePerParcel = costModels.find(c => c.scenario === '3PL')?.avg_revenue_per_parcel ?? 0;
  const projected_margin_90d = Math.round(
    volumeForecast.forecast_90d_total * avgRevenuePerParcel - totalFixedCost * 3
  );

  const userPrompt = `Hub ID: ${hubId}

Hub configuration:
${JSON.stringify(hubConfig, null, 2)}

Areas served by this hub: ${hubAreas.length} total (${activeAreas} active)

Last 90 days operational summary:
${JSON.stringify(aggregate, null, 2)}

Monthly fixed costs (BDT): ${totalFixedCost}
Fixed costs over 90 days (BDT): ${totalFixedCost * 3}

Volume forecast (next 90 days): ${volumeForecast.forecast_90d_total} parcels (${volumeForecast.trend} trend)
Avg revenue per parcel (BDT): ${avgRevenuePerParcel}

PRE-CALCULATED projected 90-day margin (BDT): ${projected_margin_90d}
Formula: (${volumeForecast.forecast_90d_total} parcels × BDT ${avgRevenuePerParcel}) - BDT ${totalFixedCost * 3} fixed costs = BDT ${projected_margin_90d}

Margin scenarios:
${JSON.stringify(costModels, null, 2)}

Should this hub be kept open (3PL), closed, or converted to 4PL-only?
Use the pre-calculated projected_margin_90d of ${projected_margin_90d} BDT in your response.`;

  const raw = await runPrompt(PROFITABILITY_SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<{ recommendation: string; risk_score: number; reasoning: string }>(raw);

  return {
    data: {
      hub_id: hubId,
      recommendation: parsed.recommendation as HubProfitabilityResult['recommendation'],
      projected_margin_90d,
      risk_score: parsed.risk_score,
    },
    reasoning: parsed.reasoning,
    confidence: 72,
  };
}

export async function runHubModelAdvisorAgent(
  hubId: number,
  volumeForecast: VolumeForecast,
  costModels: CostModelResult[]
): Promise<AgentResult<HubModelRecommendation>> {
  const [aggregate, hubConfig, totalFixedCost, hubAreas] = await Promise.all([
    fetchHubAggregate(hubId),
    fetchHubConfig(hubId),
    fetchHubMonthlyCosts(hubId),
    fetchHubAreas(hubId),
  ]);

  const activeAreas = hubAreas.filter(a => a.status === 'active').length;

  // Pre-compute projected 90-day profitability consistently with profitability agent
  const avgRevenuePerParcelAdvisor = costModels.find(c => c.scenario === '3PL')?.avg_revenue_per_parcel ?? 0;
  const projected_profitability_90d = Math.round(
    volumeForecast.forecast_90d_total * avgRevenuePerParcelAdvisor - totalFixedCost * 3
  );
  const fourPlModel = costModels.find(c => c.scenario === '4PL');
  const hybridModel = costModels.find(c => c.scenario === 'Hybrid');

  const userPrompt = `Hub ID: ${hubId}

Hub configuration:
${JSON.stringify(hubConfig, null, 2)}

Areas served by this hub: ${hubAreas.length} total (${activeAreas} active)

Last 90 days operational summary:
${JSON.stringify(aggregate, null, 2)}

Monthly fixed costs (BDT): ${totalFixedCost}
Fixed costs over 90 days (BDT): ${totalFixedCost * 3}

Volume forecast (next 90 days): ${volumeForecast.forecast_90d_total} parcels (${volumeForecast.trend} trend)

PRE-CALCULATED 90-day profitability by model:
- 3PL (current): BDT ${projected_profitability_90d}
- 4PL: BDT ${Math.round(projected_profitability_90d + (fourPlModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)}
- Hybrid: BDT ${Math.round(projected_profitability_90d + (hybridModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)}

Cost and margin scenarios (3PL / 4PL / Hybrid):
${JSON.stringify(costModels, null, 2)}

Recommend the optimal operating model (3PL-only, 4PL-only, or Hybrid) for this hub.
Use the pre-calculated projected_profitability_90d values above in your response.`;


  const raw = await runPrompt(MODEL_ADVISOR_SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<HubModelRecommendation & { reasoning: string }>(raw);

  // Use pre-computed projected_profitability_90d for the recommended model
  const recommended_90d =
    parsed.recommended_model === '4PL'
      ? Math.round(projected_profitability_90d + (fourPlModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)
      : parsed.recommended_model === 'Hybrid'
      ? Math.round(projected_profitability_90d + (hybridModel?.margin_delta_vs_current ?? 0) * volumeForecast.forecast_90d_total)
      : projected_profitability_90d;

  return {
    data: {
      hub_id: hubId,
      recommended_model: parsed.recommended_model,
      margin_uplift: parsed.margin_uplift,
      risk_score: parsed.risk_score,
      confidence: parsed.confidence,
      projected_profitability_90d: recommended_90d,
    },
    reasoning: parsed.reasoning,
    confidence: parsed.confidence,
  };
}
