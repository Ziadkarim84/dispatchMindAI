import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';
import { computeBreachProbability, computeRiskScore, getRiskThresholds } from './sla-risk.agent';

const SYSTEM_PROMPT = `You are a delivery partner selection expert for RedX, a courier company in Bangladesh.
You will receive a pre-ranked list of 4PL partners with a composite_score that combines
SLA risk (60% weight) and cost (40% weight). Lower score = better partner.

Selection guidance:
- The top-ranked partner (lowest composite_score) is typically optimal
- Override the ranking only if you have specific operational reasons (e.g., partner known to have
  capacity issues, pricing mismatch, or an operational anomaly not reflected in historical data)
- backup_partner should be the second-ranked partner by composite_score
- If no partners are available or the top partner has sla_risk_score > 80, return optimal_partner_id: 0
- sla_risk_score in your response should reflect the selected partner's risk level

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "optimal_partner_id": <number — must be one of the listed partner IDs, or 0 if none suitable>,
  "optimal_partner_name": "<string>",
  "confidence": <0-100>,
  "backup_partner_id": <number | null>,
  "backup_partner_name": "<string | null>",
  "sla_risk_score": <0-100>,
  "reasoning": "<brief — note if pre-computed ranking was used as-is or overridden>"
}`;

interface AvailablePartner {
  partner_id: number;
  partner_name: string;
  type: string;
  zone_name: string | null;
  kg05_price: number | null;
  kg1_price: number | null;
  kg2_price: number | null;
  kg3_price: number | null;
  kg4_price: number | null;
  kg5_price: number | null;
  extended_per_kg: number | null;
  cod_percentage: number | null;
  return_charge: number | null;
}

/**
 * Fetches active 4PL partners for an area, enriched with zone-aware pricing
 * from sl_fourpl_partner_pricing. Only active entries in sl_area_partners are returned.
 * Zone mapping: sl_areas.ZONE_ID 1→ISD(1), 2→SUB(2), 7+→OSD(3).
 */
async function fetchAvailablePartners(areaId: number): Promise<AvailablePartner[]> {
  return query<AvailablePartner[]>(
    `SELECT
       dp.ID                                                    AS partner_id,
       dp.NAME                                                  AS partner_name,
       dp.TYPE                                                  AS type,
       CASE
         WHEN a.ZONE_ID = 1 THEN 'ISD'
         WHEN a.ZONE_ID = 2 THEN 'SUB'
         ELSE 'OSD'
       END                                                      AS zone_name,
       pp.kg05_price,
       pp.kg1_price,
       pp.kg2_price,
       pp.kg3_price,
       pp.kg4_price,
       pp.kg5_price,
       pp.extended_per_kg,
       pp.cod_percentage,
       pp.return_charge
     FROM sl_area_partners ap
     JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
     JOIN sl_areas a ON a.ID = ap.AREA_ID
     LEFT JOIN sl_fourpl_partner_pricing pp
       ON pp.partner_id = dp.ID
       AND pp.zone_id = CASE
         WHEN a.ZONE_ID = 1 THEN 1
         WHEN a.ZONE_ID = 2 THEN 2
         ELSE 3
       END
       AND pp.status = 'active'
     WHERE ap.AREA_ID = ?
       AND ap.STATUS = 'active'
       AND dp.ID != 3`,
    [areaId]
  );
}

interface PartnerWithComputedCost extends AvailablePartner {
  computed_delivery_charge: number | null;
  computed_cod_fee: number | null;
  computed_total_cost: number | null;
}

/**
 * Resolves the delivery charge for a specific weight (grams) using the partner's
 * zone-aware weight-tier pricing. Returns null if the partner has no pricing data.
 */
function computePartnerCost(
  partner: AvailablePartner,
  weightGrams: number,
  parcelValue: number
): { delivery_charge: number; cod_fee: number; total_cost: number } | null {
  if (partner.kg1_price === null) return null;

  let deliveryCharge: number;
  if      (weightGrams <= 500)  deliveryCharge = partner.kg05_price!;
  else if (weightGrams <= 1000) deliveryCharge = partner.kg1_price!;
  else if (weightGrams <= 2000) deliveryCharge = partner.kg2_price!;
  else if (weightGrams <= 3000) deliveryCharge = partner.kg3_price!;
  else if (weightGrams <= 4000) deliveryCharge = partner.kg4_price!;
  else if (weightGrams <= 5000) deliveryCharge = partner.kg5_price!;
  else {
    const extraKg = Math.ceil((weightGrams - 5000) / 1000);
    deliveryCharge = partner.kg5_price! + extraKg * (partner.extended_per_kg ?? 0);
  }

  const codFee = Math.round(parcelValue * (partner.cod_percentage ?? 0) / 100);
  return {
    delivery_charge: Math.round(deliveryCharge),
    cod_fee: codFee,
    total_cost: Math.round(deliveryCharge) + codFee,
  };
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  const start = cleaned.search(/[{[]/);
  if (start === -1) throw new Error(`No JSON found in Claude response: ${cleaned.slice(0, 100)}`);
  const openChar = cleaned[start];
  const closeChar = openChar === '{' ? '}' : ']';

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

interface NetworkSlaRow {
  partner_id: number;
  breach_rate: number;
  total_deliveries: number;
}

/**
 * Fetches network-wide SLA performance for a list of partner IDs (across all areas).
 * Used as fallback when a partner has no area-specific delivery history.
 */
async function fetchNetworkSlaForPartners(partnerIds: number[]): Promise<Map<number, NetworkSlaRow>> {
  if (partnerIds.length === 0) return new Map();
  const rows = await query<NetworkSlaRow[]>(
    `SELECT
       partner_id,
       ROUND(SUM(late_deliveries) * 100.0 / NULLIF(SUM(total_deliveries), 0), 2) AS breach_rate,
       SUM(total_deliveries) AS total_deliveries
     FROM dm_partner_sla_performance
     WHERE partner_id IN (?)
       AND (year > YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
         OR (year = YEAR(DATE_SUB(NOW(), INTERVAL 3 MONTH))
             AND month >= MONTH(DATE_SUB(NOW(), INTERVAL 3 MONTH))))
     GROUP BY partner_id
     HAVING SUM(total_deliveries) > 0`,
    [partnerIds]
  );
  return new Map(rows.map(r => [r.partner_id, r]));
}

/**
 * Computes a composite 0-100 score for a partner:
 *   60% weight on SLA risk_score  (lower risk = lower score = better)
 *   40% weight on normalised cost (lower cost relative to max = lower score = better)
 *
 * Lower composite_score = better partner overall.
 */
function computeCompositeScore(
  riskScore: number,
  totalCost: number,
  maxCost: number,
): number {
  const normalisedCost = maxCost > 0 ? (totalCost / maxCost) * 100 : 0;
  return Math.round(0.60 * riskScore + 0.40 * normalisedCost);
}

export async function runPartnerEvaluationAgent(
  areaId: number,
  slaRisks: SlaRiskResult[],
  costModels: CostModelResult[],
  weightGrams: number,
  parcelValue: number
): Promise<AgentResult<PartnerRanking>> {
  logger.debug('[PartnerEvaluationAgent] Fetching available partners with pricing', { areaId, weightGrams, parcelValue });
  let availablePartners: AvailablePartner[];
  try {
    availablePartners = await fetchAvailablePartners(areaId);
    logger.debug('[PartnerEvaluationAgent] DB query complete', { areaId, partners: availablePartners });
  } catch (err) {
    logger.error('[PartnerEvaluationAgent] DB query failed', {
      areaId,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  // Compute actual per-parcel cost for this specific weight + parcel value
  const fourplPartnersWithCost: PartnerWithComputedCost[] = availablePartners.map(p => {
    const cost = computePartnerCost(p, weightGrams, parcelValue);
    return {
      ...p,
      // Drop raw weight-tier columns — replaced by the computed values below
      kg05_price: undefined as any, kg1_price: undefined as any, kg2_price: undefined as any,
      kg3_price: undefined as any,  kg4_price: undefined as any, kg5_price: undefined as any,
      extended_per_kg: undefined as any,
      computed_delivery_charge: cost?.delivery_charge ?? null,
      computed_cod_fee: cost?.cod_fee ?? null,
      computed_total_cost: cost?.total_cost ?? null,
    };
  });

  const partnersWithCost    = fourplPartnersWithCost.filter(p => p.computed_total_cost !== null);
  const partnersWithoutCost = fourplPartnersWithCost.filter(p => p.computed_total_cost === null);

  // For partners with no area-specific SLA history, fetch their network-wide performance
  // as a fallback. Assign a +10 point area-unfamiliarity penalty (they haven't served
  // this specific area before). If no data anywhere, use 45 (unrated / medium-low risk).
  const partnerIdsWithoutAreaSla = partnersWithCost
    .filter(p => !slaRisks.find(r => r.partner_id === p.partner_id))
    .map(p => p.partner_id);
  const networkSla = await fetchNetworkSlaForPartners(partnerIdsWithoutAreaSla);
  const thresholds = getRiskThresholds(3); // standard SLA for fallback scoring

  // Build composite-scored, pre-ranked list for Claude
  const maxCost = Math.max(...partnersWithCost.map(p => p.computed_total_cost!), 1);
  const rankedPartners = partnersWithCost
    .map(p => {
      const areaRisk = slaRisks.find(r => r.partner_id === p.partner_id);
      let riskScore: number;
      let slaSource: string;

      if (areaRisk) {
        // Best case: area-specific SLA history exists
        riskScore = areaRisk.risk_score;
        slaSource = 'area-specific';
      } else {
        const networkRow = networkSla.get(p.partner_id);
        if (networkRow) {
          // Network-wide data available — use it with a +10 area unfamiliarity penalty
          const bp = computeBreachProbability(networkRow.breach_rate, 3, networkRow.total_deliveries);
          riskScore = Math.min(100, computeRiskScore(bp, thresholds) + 10);
          slaSource = 'network-wide (+10 area penalty)';
        } else {
          // No data at all — unrated partner, assume medium-low risk (45)
          riskScore = 45;
          slaSource = 'unrated (no history)';
        }
      }

      const composite = computeCompositeScore(riskScore, p.computed_total_cost!, maxCost);
      return { ...p, sla_risk_score: riskScore, sla_source: slaSource, composite_score: composite };
    })
    .sort((a, b) => a.composite_score - b.composite_score); // best first

  const userPrompt = `Area ID: ${areaId}
Parcel: ${weightGrams}g, value BDT ${parcelValue}

Pre-ranked 4PL partners (composite_score = 60% SLA risk + 40% cost, lower = better):
${JSON.stringify(rankedPartners, null, 2)}

Partners without pricing data (excluded from ranking):
${JSON.stringify(partnersWithoutCost, null, 2)}

Hub-level cost modeling (strategic context):
${JSON.stringify(costModels, null, 2)}

Select from the ranked list above. The lowest composite_score partner is recommended unless
you have operational reasons to override. Return optimal_partner_id: 0 only if the top
partner has sla_risk_score > 80 or no partners are listed.`;

  logger.debug('[PartnerEvaluationAgent] Calling Claude', { areaId, partnerCount: availablePartners.length + 1 });
  let raw: string;
  try {
    raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
    logger.debug('[PartnerEvaluationAgent] Claude raw response', { raw });
  } catch (err) {
    logger.error('[PartnerEvaluationAgent] Claude call failed', {
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  let parsed: PartnerRanking & { reasoning: string };
  try {
    parsed = parseClaudeJson<PartnerRanking & { reasoning: string }>(raw);
  } catch (err) {
    logger.error('[PartnerEvaluationAgent] JSON parse failed', { raw, message: (err as Error).message });
    throw err;
  }

  return {
    data: {
      optimal_partner_id: parsed.optimal_partner_id,
      optimal_partner_name: parsed.optimal_partner_name,
      confidence: parsed.confidence,
      backup_partner_id: parsed.backup_partner_id,
      backup_partner_name: parsed.backup_partner_name,
      sla_risk_score: parsed.sla_risk_score,
    },
    reasoning: parsed.reasoning,
    confidence: parsed.confidence,
  };
}
