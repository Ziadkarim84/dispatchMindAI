import { AgentResult, CostModelResult, HubMonthlyCost, VolumeForecast } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const SYSTEM_PROMPT = `You are a logistics cost and margin analyst for RedX, a courier company in Bangladesh.
You will receive per-hub revenue data, 4PL partner costs, fixed monthly hub costs, and the Shopup internal
variable cost per parcel (fuel, rider commission, sorting labour — provided in the input).
Calculate contribution margins for three dispatch scenarios: 3PL (internal RedX), 4PL (external partner), and Hybrid.

Margin formula per parcel:
- Revenue         = SHOPUP_CHARGE + SHOPUP_COD_CHARGE (delivered) OR SHOPUP_RETURN_CHARGE (returned)
- 3PL Variable    = shopup_internal_cost_per_parcel (internal handling, fuel, rider wages)
- 4PL Cost        = average charge paid to external partner per parcel
- Fixed Cost/parcel = monthly fixed costs / monthly parcel volume
- 3PL margin      = Revenue - 3PL_Variable - Fixed_Cost_per_parcel
- 4PL margin      = Revenue - 4PL_Cost - Fixed_Cost_per_parcel
- Hybrid margin   = Revenue - (0.5 × 3PL_Variable + 0.5 × 4PL_Cost) - Fixed_Cost_per_parcel
- margin_delta_vs_current: positive means this scenario is MORE profitable than current baseline

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "scenario": "3PL",
    "avg_revenue_per_parcel": <number>,
    "avg_cost_per_parcel": <number>,
    "avg_fixed_cost_per_parcel": <number>,
    "avg_margin_per_parcel": <number>,
    "margin_delta_vs_current": <number>,
    "reasoning": "<brief>"
  },
  { "scenario": "4PL", ... },
  { "scenario": "Hybrid", ... }
]`;


interface HubMarginSummary {
  hub_id: number;
  total_parcels: number;
  delivered_parcels: number;
  returned_parcels: number;
  total_revenue: number;
  total_4pl_cost: number;
  total_fixed_cost: number;
  avg_margin_per_parcel: number;
}

async function fetchHubMarginSummary(hubId: number): Promise<HubMarginSummary | null> {
  const rows = await query<HubMarginSummary[]>(
    `SELECT
       hub_id,
       SUM(total_parcels)     AS total_parcels,
       SUM(delivered_parcels) AS delivered_parcels,
       SUM(returned_parcels)  AS returned_parcels,
       SUM(total_revenue)     AS total_revenue,
       SUM(total_4pl_cost)    AS total_4pl_cost,
       SUM(total_fixed_cost)  AS total_fixed_cost,
       ROUND(SUM(total_revenue - total_4pl_cost - total_fixed_cost)
         / NULLIF(SUM(total_parcels), 0), 2) AS avg_margin_per_parcel
     FROM dm_hub_contribution_margin
     WHERE hub_id = ?
       AND (year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     GROUP BY hub_id`,
    [hubId]
  );
  return rows[0] ?? null;
}

async function fetchHubFixedCosts(hubId: number): Promise<HubMonthlyCost | null> {
  const rows = await query<HubMonthlyCost[]>(
    `SELECT * FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = YEAR(NOW()) AND month = MONTH(NOW())
     LIMIT 1`,
    [hubId]
  );
  return rows[0] ?? null;
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === '{' ? '}' : ']';

  // Bracket-depth matching to find the correct closing bracket (avoids lastIndexOf
  // finding brackets in trailing text/markdown that Claude sometimes appends)
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
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

export async function runCostModelingAgent(
  hubId: number,
  volumeForecast: VolumeForecast
): Promise<AgentResult<CostModelResult[]>> {
  const [marginSummary, fixedCosts] = await Promise.all([
    fetchHubMarginSummary(hubId),
    fetchHubFixedCosts(hubId),
  ]);

  // Shopup internal variable cost per parcel: covers rider wages, fuel, sorting labour.
  // Configurable via SHOPUP_INTERNAL_COST_PER_PARCEL env var (default 20 BDT).
  const shopupInternalCostPerParcel = Number(process.env.SHOPUP_INTERNAL_COST_PER_PARCEL ?? 20);

  const userPrompt = `Hub ID: ${hubId}
Monthly parcel volume (forecast): ${volumeForecast.predicted_daily_avg * 30} parcels/month
Shopup internal variable cost per parcel: BDT ${shopupInternalCostPerParcel} (rider wages, fuel, sorting)

Pre-aggregated hub margin summary (last 3 months):
${marginSummary ? JSON.stringify(marginSummary, null, 2) : 'No aggregated data available — assume 0 revenue and costs'}

Hub fixed monthly costs (BDT):
${fixedCosts ? JSON.stringify(fixedCosts, null, 2) : 'No fixed cost data available — assume 0'}

Calculate the contribution margin per parcel for 3PL, 4PL, and Hybrid scenarios.
Use the formulas in the system prompt. margin_delta_vs_current compares each scenario vs the 3PL baseline.`;

  const raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<Array<{
    scenario: '3PL' | '4PL' | 'Hybrid';
    avg_revenue_per_parcel: number;
    avg_cost_per_parcel: number;
    avg_fixed_cost_per_parcel: number;
    avg_margin_per_parcel: number;
    margin_delta_vs_current: number;
    reasoning: string;
  }>>(raw);

  return {
    data: parsed.map(s => ({
      hub_id: hubId,
      scenario: s.scenario,
      avg_revenue_per_parcel: s.avg_revenue_per_parcel,
      avg_cost_per_parcel: s.avg_cost_per_parcel,
      avg_fixed_cost_per_parcel: s.avg_fixed_cost_per_parcel,
      avg_margin_per_parcel: s.avg_margin_per_parcel,
      margin_delta_vs_current: s.margin_delta_vs_current,
    })),
    reasoning: parsed.map(s => `${s.scenario}: ${s.reasoning}`).join(' | '),
    confidence: 75,
  };
}
