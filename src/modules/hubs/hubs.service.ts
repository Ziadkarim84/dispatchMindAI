import { HubModelRecommendation, HubProfitabilityResult } from '@common/types';

// TODO (5.8): Run Volume Forecast + Cost Modeling + Network Strategy agents for a hub
export async function getHubProfitability(
  _hubId: number
): Promise<HubProfitabilityResult> {
  throw new Error('Not implemented');
}

// TODO (5.11): Compare 3PL-only vs 4PL-only vs Hybrid via Network Strategy Agent
export async function getHubModelAdvice(
  _hubId: number
): Promise<HubModelRecommendation> {
  throw new Error('Not implemented');
}
