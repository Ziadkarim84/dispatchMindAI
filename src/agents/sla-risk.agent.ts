import { AgentResult, PartnerSlaStats, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const SYSTEM_PROMPT = `You are an SLA risk analyst for RedX, a courier company in Bangladesh.
You will receive historical delivery performance data per partner for a specific area.
Analyze breach rates and return a risk assessment for each partner.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "partner_id": <number>,
    "partner_name": "<string>",
    "area_id": <number>,
    "breach_probability": <0-100>,
    "risk_score": <0-100>,
    "risk_level": "LOW" | "MEDIUM" | "HIGH",
    "reasoning": "<brief>"
  }
]

Risk thresholds: breach_probability < 15% → LOW, 15-35% → MEDIUM, > 35% → HIGH.`;

async function fetchPartnerSlaStats(areaId: number): Promise<PartnerSlaStats[]> {
  return query<PartnerSlaStats[]>(
    `SELECT
       p.PARTNER_ID                                             AS partner_id,
       COALESCE(dp.NAME, 'Shopup (Internal)')                  AS partner_name,
       ? AS area_id,
       COUNT(*)                                                 AS total_deliveries,
       SUM(
         CASE
           WHEN TIMESTAMPDIFF(DAY, p.created_at, pl.created_at)
                > COALESCE(h.SLA_TARGET, 3)
           THEN 1 ELSE 0
         END
       )                                                        AS late_deliveries,
       ROUND(
         SUM(
           CASE
             WHEN TIMESTAMPDIFF(DAY, p.created_at, pl.created_at)
                  > COALESCE(h.SLA_TARGET, 3)
             THEN 1 ELSE 0
           END
         ) * 100.0 / COUNT(*), 2
       )                                                        AS breach_rate
     FROM sl_parcels p
     JOIN sl_logistics_parcel_routes r
       ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
     JOIN sl_hubs h ON h.ID = r.HUB_ID
     LEFT JOIN sl_delivery_partners dp ON dp.ID = p.PARTNER_ID
     JOIN (
       SELECT PARCEL_ID, MIN(created_at) AS created_at
       FROM sl_parcel_logs
       WHERE STATUS IN (
         'delivered','cash-received','delivery-payment-collected',
         'delivery-payment-sent','hub-payment-collected'
       )
       GROUP BY PARCEL_ID
     ) pl ON pl.PARCEL_ID = p.ID
     WHERE p.AREA_ID = ?
       AND p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
     GROUP BY p.PARTNER_ID, dp.NAME
     HAVING total_deliveries > 0`,
    [areaId, areaId]
  );
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned) as T;
}

export async function runSlaRiskAgent(areaId: number): Promise<AgentResult<SlaRiskResult[]>> {
  const stats = await fetchPartnerSlaStats(areaId);

  if (stats.length === 0) {
    return {
      data: [],
      reasoning: 'No delivery data found for this area.',
      confidence: 0,
    };
  }

  const userPrompt = `Area ID: ${areaId}
Delivery performance per partner (last 90 days):
${JSON.stringify(stats, null, 2)}

Assess breach probability and risk score for each partner in this area.`;

  const raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<Array<SlaRiskResult & { reasoning: string }>>(raw);

  return {
    data: parsed.map(r => ({
      partner_id: r.partner_id,
      partner_name: r.partner_name,
      area_id: r.area_id,
      breach_probability: r.breach_probability,
      risk_score: r.risk_score,
      risk_level: r.risk_level,
    })),
    reasoning: parsed.map(r => `${r.partner_name}: ${r.reasoning}`).join(' | '),
    confidence: 78,
  };
}
