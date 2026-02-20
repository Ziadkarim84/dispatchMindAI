import { AgentResult, HubDailyVolume, VolumeForecast } from '@common/types';
import { runPrompt } from './base.agent';

// TODO (4.1): Query sl_parcels grouped by DESTINATION_HUB_ID and DATE(created_at) for last 90 days
// TODO (4.2): Send historical volume series to Claude → return predicted daily volume + trend

export async function runVolumeForecastAgent(
  _hubId: number
): Promise<AgentResult<VolumeForecast>> {
  void runPrompt; // will be used in implementation
  void ({} as HubDailyVolume);
  throw new Error('Not implemented');
}
