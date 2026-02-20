import { AgentResult, SlaRiskResult } from '@common/types';
import { runPrompt } from './base.agent';

// TODO (4.5): Query breach count per RESPONSIBLE_DELIVERY_PARTNER_ID per zone
//             from sl_logistics_issue joined with sl_logistics_issue_sla_trackings
// TODO (4.6): Query hub TAT compliance from sl_logistics_hub_tats
// TODO (4.7): Send SLA history to Claude → return breach probability + risk score per partner/zone

export async function runSlaRiskAgent(
  _zoneId: number
): Promise<AgentResult<SlaRiskResult[]>> {
  void runPrompt;
  throw new Error('Not implemented');
}
