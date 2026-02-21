import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';
import { logger } from '@common/utils/logger.util';

const SYSTEM_PROMPT = `You are a delivery partner selection expert for RedX, a courier company in Bangladesh.
You will receive available partners for an area along with their SLA risk scores, actual per-parcel pricing
(broken down by weight tier for the area's delivery zone), and hub-level cost modeling data.
Select the optimal partner and a backup, balancing cost savings and SLA reliability.

Pricing context:
- Each 4PL partner has zone-specific pricing (ISD=Dhaka City, SUB=Dhaka Suburbs, OSD=Outside Dhaka)
- Weight tiers: kg05=≤500g, kg1=≤1kg, kg2=≤2kg, kg3=≤3kg, kg4=≤4kg, kg5=≤5kg
- The most common weight bucket is ≤1kg (kg1_price) — use it as the primary cost reference
- "Shopup (Internal)" is always an option as the baseline 3PL; use cost modeling margin data for it

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

export async function runPartnerEvaluationAgent(
  areaId: number,
  slaRisks: SlaRiskResult[],
  costModels: CostModelResult[]
): Promise<AgentResult<PartnerRanking>> {
  logger.debug('[PartnerEvaluationAgent] Fetching available partners with pricing', { areaId });
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

  // Always include Shopup internal (3PL) as baseline — no partner pricing row
  const shopupInternal: AvailablePartner = {
    partner_id: 0,
    partner_name: 'Shopup (Internal)',
    type: '3PL',
    zone_name: null,
    kg05_price: null, kg1_price: null, kg2_price: null,
    kg3_price: null, kg4_price: null, kg5_price: null,
    extended_per_kg: null, cod_percentage: null, return_charge: null,
  };
  const allPartners = [shopupInternal, ...availablePartners];

  // Separate 3PL baseline from 4PL options for clearer prompt structure
  const fourplPartners = availablePartners.filter(p => p.kg1_price !== null);
  const partnersWithoutPricing = availablePartners.filter(p => p.kg1_price === null);

  const userPrompt = `Area ID: ${areaId}

Available delivery partners with zone-based pricing:
${JSON.stringify(fourplPartners, null, 2)}

Partners available but without pricing data (use SLA and cost models only):
${JSON.stringify(partnersWithoutPricing, null, 2)}

Shopup (Internal) 3PL is always available as baseline.

SLA risk assessment per partner (last 90 days):
${JSON.stringify(slaRisks, null, 2)}

Hub-level cost modeling (3PL vs 4PL vs Hybrid margin scenarios):
${JSON.stringify(costModels, null, 2)}

Select the optimal partner and a backup for this area.
Prioritize: low SLA risk first, then lowest cost (use kg1_price as the primary cost reference).
If a partner has better SLA and lower cost than others, strongly prefer them.`;

  logger.debug('[PartnerEvaluationAgent] Calling Claude', { areaId, partnerCount: allPartners.length });
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
