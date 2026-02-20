import { AgentResult, CostModelResult, HubMonthlyCost, HubRevenueRow, VolumeForecast } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const SYSTEM_PROMPT = `You are a logistics cost and margin analyst for RedX, a courier company in Bangladesh.
You will receive per-hub revenue data, 4PL partner costs, and fixed monthly hub costs.
Calculate contribution margins for three dispatch scenarios: 3PL (internal RedX), 4PL (external partner), and Hybrid.

Margin formula per parcel:
- Revenue  = SHOPUP_CHARGE + SHOPUP_COD_CHARGE (delivered) OR SHOPUP_RETURN_CHARGE (returned)
- 4PL Cost = average charge paid to external partner per parcel
- Fixed Cost per parcel = monthly fixed costs / monthly parcel volume

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

const DELIVERED_STATUSES = `'delivered','cash-received','delivery-payment-collected','delivery-payment-sent','hub-payment-collected'`;
const RETURNED_STATUSES = `'shopup_returned'`;

async function fetchHubRevenue(hubId: number): Promise<HubRevenueRow[]> {
  return query<HubRevenueRow[]>(
    `SELECT
       r.HUB_ID AS hub_id,
       CASE
         WHEN p.STATUS IN (${DELIVERED_STATUSES}) THEN 'delivered'
         WHEN p.STATUS IN (${RETURNED_STATUSES})  THEN 'returned'
         ELSE 'other'
       END                         AS status,
       COUNT(*)                    AS parcel_count,
       SUM(p.SHOPUP_CHARGE)        AS total_shopup_charge,
       SUM(p.SHOPUP_COD_CHARGE)    AS total_cod_charge,
       SUM(p.SHOPUP_RETURN_CHARGE) AS total_return_charge
     FROM sl_parcels p
     JOIN sl_logistics_parcel_routes r
       ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
     WHERE r.HUB_ID = ?
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY r.HUB_ID, status`,
    [hubId]
  );
}

async function fetchFourPlCosts() {
  return query<{ parcel_count: number; total_charge: number }[]>(
    `SELECT COUNT(*) AS parcel_count, SUM(FOURPL_DELIVERY_CHARGE) AS total_charge
     FROM sl_fourpl_parcels
     WHERE created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`
  );
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
  const end = cleaned.lastIndexOf(closeChar);
  if (end === -1) throw new Error(`No closing ${closeChar} found in Claude response`);
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

export async function runCostModelingAgent(
  hubId: number,
  volumeForecast: VolumeForecast
): Promise<AgentResult<CostModelResult[]>> {
  const [revenueRows, fourPlRows, fixedCosts] = await Promise.all([
    fetchHubRevenue(hubId),
    fetchFourPlCosts(),
    fetchHubFixedCosts(hubId),
  ]);

  const userPrompt = `Hub ID: ${hubId}
Monthly parcel volume (forecast): ${volumeForecast.predicted_daily_avg * 30} parcels/month

Revenue breakdown by parcel status (last 90 days):
${JSON.stringify(revenueRows, null, 2)}

4PL partner cost data (last 90 days):
${JSON.stringify(fourPlRows, null, 2)}

Hub fixed monthly costs (BDT):
${fixedCosts ? JSON.stringify(fixedCosts, null, 2) : 'No fixed cost data available — assume 0'}

Calculate the contribution margin per parcel for 3PL, 4PL, and Hybrid scenarios.
For Hybrid assume 50% 3PL + 50% 4PL split.
margin_delta_vs_current should compare each scenario vs the current 3PL baseline.`;

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
