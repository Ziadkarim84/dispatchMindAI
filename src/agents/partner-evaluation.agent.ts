import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';

const SYSTEM_PROMPT = `You are a delivery partner selection expert for RedX, a courier company in Bangladesh.
You will receive available partners for an area along with their SLA risk scores, the computed
all-in cost for this specific parcel (delivery charge + COD fee for the actual weight and value),
and hub-level cost modeling data.
Select the optimal partner and a backup, balancing cost savings and SLA reliability.

Cost context:
- "computed_delivery_charge": the exact charge for this parcel's weight in this zone
- "computed_cod_fee": COD fee = parcel_value × cod_percentage / 100
- "computed_total_cost": delivery_charge + cod_fee — this is the true per-parcel 4PL cost
- "Shopup (Internal)" has no per-parcel fee; use the 3PL margin from cost modeling data instead
- Prefer partners with lower total_cost AND lower SLA risk

Return ONLY a valid JSON object (no markdown, no explanation):
{
  "optimal_partner_id": <number>,
  "optimal_partner_name": "<string>",
  "confidence": <0-100>,
  "backup_partner_id": <number | null>,
  "backup_partner_name": "<string | null>",
  "sla_risk_score": <0-100>,
  "reasoning": "<brief explanation>"
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
       AND ap.STATUS = 'active'`,
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

  const userPrompt = `Area ID: ${areaId}
Parcel: ${weightGrams}g, value BDT ${parcelValue}

4PL partners — computed cost for this parcel (delivery charge + COD fee):
${JSON.stringify(partnersWithCost, null, 2)}

Partners without pricing data (use SLA risk scores only):
${JSON.stringify(partnersWithoutCost, null, 2)}

Shopup (Internal) 3PL is always available as baseline — no per-parcel 4PL fee applies.

SLA risk assessment per partner (last 90 days):
${JSON.stringify(slaRisks, null, 2)}

Hub-level cost modeling (3PL vs 4PL vs Hybrid margin scenarios):
${JSON.stringify(costModels, null, 2)}

Select the optimal partner and a backup for this area.
Prioritize: low SLA risk first, then lowest computed_total_cost.
If a partner has better SLA and lower cost than others, strongly prefer them.`;

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
