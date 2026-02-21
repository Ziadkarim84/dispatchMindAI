import { AgentResult, PartnerSlaStats, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';

const BASE_SYSTEM_PROMPT = `You are an SLA risk analyst for RedX, a courier company in Bangladesh.
You will receive historical delivery performance data per partner for a specific area,
plus the merchant's required delivery SLA and the corresponding risk thresholds.
Analyze breach rates and return a risk assessment for each partner.

Important: the historical breach_rate is calculated against the hub's standard SLA_TARGET (typically 3 days).
If the merchant's required SLA is shorter than 3 days, the true breach probability will be higher than the
historical rate — adjust upward proportionally. If longer, adjust downward slightly.

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
]`;

async function fetchPartnerSlaStats(areaId: number): Promise<PartnerSlaStats[]> {
  return query<PartnerSlaStats[]>(
    `SELECT
       partner_id,
       partner_name,
       area_id,
       SUM(total_deliveries) AS total_deliveries,
       SUM(late_deliveries)  AS late_deliveries,
       ROUND(SUM(late_deliveries) * 100.0 / NULLIF(SUM(total_deliveries), 0), 2) AS breach_rate
     FROM dm_partner_sla_performance
     WHERE area_id = ?
       AND (year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     GROUP BY partner_id, partner_name, area_id
     HAVING total_deliveries > 0`,
    [areaId]
  );
}

/**
 * Returns breach-rate thresholds for LOW/MEDIUM/HIGH based on the merchant's
 * required SLA window. Tighter SLAs mean fewer late deliveries are acceptable.
 */
function getRiskThresholds(slaDays: number): { low: number; medium: number } {
  if (slaDays <= 1) return { low: 5,  medium: 15 }; // same/next-day — very tight
  if (slaDays === 2) return { low: 10, medium: 25 }; // 2-day
  if (slaDays <= 3) return { low: 15, medium: 35 }; // standard (default hub SLA)
  if (slaDays <= 5) return { low: 20, medium: 40 }; // relaxed
  return              { low: 25, medium: 50 };       // very relaxed (5+ days)
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

export async function runSlaRiskAgent(areaId: number, slaDays: number = 3): Promise<AgentResult<SlaRiskResult[]>> {
  logger.debug('[SlaRiskAgent] Fetching partner SLA stats', { areaId });
  let stats: PartnerSlaStats[];
  try {
    stats = await fetchPartnerSlaStats(areaId);
    logger.debug('[SlaRiskAgent] DB query complete', { areaId, rowCount: stats.length, rows: stats });
  } catch (err) {
    logger.error('[SlaRiskAgent] DB query failed', {
      areaId,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  if (stats.length === 0) {
    logger.warn('[SlaRiskAgent] No delivery data found for area', { areaId });
    return {
      data: [],
      reasoning: 'No delivery data found for this area.',
      confidence: 0,
    };
  }

  const thresholds = getRiskThresholds(slaDays);
  const systemPrompt = `${BASE_SYSTEM_PROMPT}
Risk thresholds for this request (merchant SLA = ${slaDays} day${slaDays !== 1 ? 's' : ''}):
breach_probability < ${thresholds.low}% → LOW, ${thresholds.low}-${thresholds.medium}% → MEDIUM, > ${thresholds.medium}% → HIGH.`;

  const userPrompt = `Area ID: ${areaId}
Merchant required SLA: ${slaDays} day${slaDays !== 1 ? 's' : ''} (hub standard SLA is typically 3 days)
Delivery performance per partner (last 90 days):
${JSON.stringify(stats, null, 2)}

Assess breach probability and risk score for each partner in this area.
Adjust breach_probability upward if the merchant SLA is shorter than the hub's 3-day standard.`;

  logger.debug('[SlaRiskAgent] Calling Claude', { slaDays, thresholds });
  let raw: string;
  try {
    raw = await runPrompt(systemPrompt, userPrompt);
    logger.debug('[SlaRiskAgent] Claude raw response', { raw });
  } catch (err) {
    logger.error('[SlaRiskAgent] Claude call failed', {
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  let parsed: Array<SlaRiskResult & { reasoning: string }>;
  try {
    parsed = parseClaudeJson<Array<SlaRiskResult & { reasoning: string }>>(raw);
  } catch (err) {
    logger.error('[SlaRiskAgent] JSON parse failed', { raw, message: (err as Error).message });
    throw err;
  }

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
