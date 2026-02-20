import { AgentResult, CostModelResult, HubModelRecommendation, HubProfitabilityResult, VolumeForecast } from '@common/types';
import { runPrompt } from './base.agent';

// TODO (4.11): Query per-hub aggregates: total volume, avg margin, partner dependency ratio
//              from sl_parcels + sl_logistics_finance_reports
// TODO (4.12): Query hub cost structure from sl_hubs (SLA_TIER, IS_MH, IS_RMH) + sl_hub_configs
// TODO (4.13): Feed volume forecast + margin + hub config to Claude → open/close/convert + 90d projection

export async function runNetworkStrategyAgent(
  _hubId: number,
  _volumeForecast: VolumeForecast,
  _costModels: CostModelResult[]
): Promise<AgentResult<HubProfitabilityResult>> {
  void runPrompt;
  throw new Error('Not implemented');
}

export async function runHubModelAdvisorAgent(
  _hubId: number,
  _volumeForecast: VolumeForecast,
  _costModels: CostModelResult[]
): Promise<AgentResult<HubModelRecommendation>> {
  void runPrompt;
  throw new Error('Not implemented');
}
