import { AgentResult, CostModelResult, VolumeForecast } from '@common/types';
import { runPrompt } from './base.agent';

// TODO (4.3): Query avg SHOPUP_CHARGE, PARTNER_CHARGE, SUBSIDY_AMOUNT, COD_CHARGE, RETURN_CHARGE
//             per hub per partner from sl_logistics_finance_reports
// TODO (4.4): Send cost breakdown to Claude → return margin per scenario (3PL / 4PL / Hybrid)

export async function runCostModelingAgent(
  _hubId: number,
  _volumeForecast: VolumeForecast
): Promise<AgentResult<CostModelResult[]>> {
  void runPrompt;
  throw new Error('Not implemented');
}
