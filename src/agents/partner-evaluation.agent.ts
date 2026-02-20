import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult } from '@common/types';
import { runPrompt } from './base.agent';

// TODO (4.8): Query available partners for a zone from sl_partner_zones + sl_delivery_partners
// TODO (4.9): Query 4PL (Steadfast) settlement rate and sync failures from 4pl_manual_script_logs
// TODO (4.10): Feed SLA risk scores + cost data + partner availability to Claude → ranked partners

export async function runPartnerEvaluationAgent(
  _zoneId: number,
  _slaRisks: SlaRiskResult[],
  _costModels: CostModelResult[]
): Promise<AgentResult<PartnerRanking>> {
  void runPrompt;
  throw new Error('Not implemented');
}
