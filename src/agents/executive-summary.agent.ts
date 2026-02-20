import { AgentResult, CostModelResult, PartnerRanking, SlaRiskResult, VolumeForecast } from '@common/types';
import { runPrompt } from './base.agent';

export interface ExecutiveSummaryInput {
  hubId: number;
  volumeForecast: VolumeForecast;
  costModels: CostModelResult[];
  slaRisks: SlaRiskResult[];
  partnerRanking: PartnerRanking;
}

// TODO (4.14): Accept outputs from Agents 1–5
// TODO (4.15): Claude generates a concise human-readable decision report

export async function runExecutiveSummaryAgent(
  _input: ExecutiveSummaryInput
): Promise<AgentResult<string>> {
  void runPrompt;
  throw new Error('Not implemented');
}
