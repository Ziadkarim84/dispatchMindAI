import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult } from '@common/types';
import { query } from '@database/connection';
import { runPrompt } from './base.agent';

const SYSTEM_PROMPT = `You are a delivery partner selection expert for RedX, a courier company in Bangladesh.
You will receive available partners for an area along with their SLA risk scores and cost comparison data.
Select the optimal partner and a backup, balancing cost savings and SLA reliability.

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
}

async function fetchAvailablePartners(areaId: number): Promise<AvailablePartner[]> {
  return query<AvailablePartner[]>(
    `SELECT
       dp.ID   AS partner_id,
       dp.NAME AS partner_name,
       dp.TYPE AS type
     FROM sl_area_partners ap
     JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
     WHERE ap.AREA_ID = ?`,
    [areaId]
  );
}

function parseClaudeJson<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned) as T;
}

export async function runPartnerEvaluationAgent(
  areaId: number,
  slaRisks: SlaRiskResult[],
  costModels: CostModelResult[]
): Promise<AgentResult<PartnerRanking>> {
  const availablePartners = await fetchAvailablePartners(areaId);

  // Always include Shopup internal (3PL) as an option
  const shopupInternal: AvailablePartner = { partner_id: 0, partner_name: 'Shopup (Internal)', type: '3PL' };
  const allPartners = [shopupInternal, ...availablePartners];

  const userPrompt = `Area ID: ${areaId}

Available delivery partners:
${JSON.stringify(allPartners, null, 2)}

SLA risk assessment per partner:
${JSON.stringify(slaRisks, null, 2)}

Cost modeling results (margin per scenario):
${JSON.stringify(costModels, null, 2)}

Select the optimal partner and a backup partner for this area.
Prioritize: low SLA risk first, then higher margin improvement.`;

  const raw = await runPrompt(SYSTEM_PROMPT, userPrompt);
  const parsed = parseClaudeJson<PartnerRanking & { reasoning: string }>(raw);

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
