import { AgentResult, PartnerSlaStats, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';

const BASE_SYSTEM_PROMPT = `You are an SLA risk analyst for RedX, a courier company in Bangladesh.
You will receive historical delivery performance data per partner for a specific area.
Each partner entry already includes pre-computed breach_probability and risk_score values
derived from historical data and the merchant's SLA requirement.

Your role is to validate these computed scores and apply any operational context that
the raw numbers cannot capture (e.g., partner recently expanded capacity, new route opened,
known operational issues). If the data is sufficient and no anomalies exist, use the
provided computed values directly.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "partner_id": <number>,
    "partner_name": "<string>",
    "area_id": <number>,
    "breach_probability": <0-100>,
    "risk_score": <0-100>,
    "risk_level": "LOW" | "MEDIUM" | "HIGH",
    "reasoning": "<brief — note if computed values were used as-is or adjusted>"
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

/**
 * Deterministically computes breach_probability from historical breach_rate
 * adjusted for the merchant's required SLA vs the hub's standard 3-day SLA.
 *
 * - Tighter SLA (slaDays < 3): scale breach rate upward proportionally
 * - Same as standard (slaDays = 3): use historical rate directly
 * - Looser SLA (slaDays > 3): reduce by 30% (most partners can meet relaxed targets)
 * - Low sample size (<30 deliveries): add uncertainty penalty up to 20 points
 */
function computeBreachProbability(
  historicalBreachRate: number,
  merchantSlaDays: number,
  totalDeliveries: number,
  hubSlaDays: number = 3,
): number {
  let adjusted = historicalBreachRate;

  if (merchantSlaDays < hubSlaDays) {
    // Tighter requirement → more deliveries will exceed merchant's window
    adjusted = Math.min(100, historicalBreachRate * (hubSlaDays / merchantSlaDays));
  } else if (merchantSlaDays > hubSlaDays) {
    // Relaxed requirement → most formerly-late deliveries now fall within window
    adjusted = historicalBreachRate * 0.70;
  }

  // Low sample size: add an uncertainty penalty (up to +20) when fewer than 30 deliveries
  const samplePenalty = totalDeliveries < 30
    ? Math.round(20 * (1 - totalDeliveries / 30))
    : 0;

  return Math.min(100, Math.round(adjusted + samplePenalty));
}

/**
 * Maps breach_probability to a 0-100 risk_score using the risk thresholds:
 *   0 – low_threshold    → 0–30 (LOW)
 *   low – medium         → 30–60 (MEDIUM)
 *   medium – 100         → 60–100 (HIGH)
 */
function computeRiskScore(
  breachProbability: number,
  thresholds: { low: number; medium: number },
): number {
  if (breachProbability <= thresholds.low) {
    return Math.round((breachProbability / Math.max(thresholds.low, 1)) * 30);
  } else if (breachProbability <= thresholds.medium) {
    const ratio = (breachProbability - thresholds.low)
      / Math.max(thresholds.medium - thresholds.low, 1);
    return Math.round(30 + ratio * 30);
  } else {
    const ratio = Math.min(1,
      (breachProbability - thresholds.medium) / Math.max(100 - thresholds.medium, 1));
    return Math.round(60 + ratio * 40);
  }
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

  // Pre-compute deterministic breach_probability and risk_score for each partner.
  // These are passed to Claude for validation — Claude adjusts only if it has
  // additional operational context not reflected in the historical numbers.
  const statsWithComputed = stats.map(s => ({
    ...s,
    computed_breach_probability: computeBreachProbability(
      Number(s.breach_rate), slaDays, Number(s.total_deliveries)),
    computed_risk_score: computeRiskScore(
      computeBreachProbability(Number(s.breach_rate), slaDays, Number(s.total_deliveries)),
      thresholds),
  }));

  const systemPrompt = `${BASE_SYSTEM_PROMPT}
Risk thresholds (merchant SLA = ${slaDays} day${slaDays !== 1 ? 's' : ''}):
breach_probability < ${thresholds.low}% → LOW | ${thresholds.low}–${thresholds.medium}% → MEDIUM | > ${thresholds.medium}% → HIGH.`;

  const userPrompt = `Area ID: ${areaId}
Merchant required SLA: ${slaDays} day${slaDays !== 1 ? 's' : ''} (hub standard SLA: 3 days)

Partner performance data with pre-computed scores (last 90 days):
${JSON.stringify(statsWithComputed, null, 2)}

The computed_breach_probability and computed_risk_score have been calculated mathematically
from historical data, adjusting for the merchant's SLA requirement and sample size.
Validate these scores and return them as breach_probability/risk_score unless you have
specific operational context that warrants an adjustment.`;

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
