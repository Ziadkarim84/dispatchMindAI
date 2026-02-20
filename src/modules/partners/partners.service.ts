import { PartnerRanking } from '@common/types';
import { runSlaRiskAgent } from '@agents/sla-risk.agent';
import { runPartnerEvaluationAgent } from '@agents/partner-evaluation.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { logger } from '@common/utils/logger.util';
import { PartnerOptimizeInput } from './partners.schema';

export async function getOptimalPartner(input: PartnerOptimizeInput): Promise<PartnerRanking> {
  const { area_id, hub_id } = input;

  logger.info('Starting partner optimization', { area_id, hub_id });

  // Run volume forecast + cost modeling + SLA risk in parallel
  const [volumeResult, slaResult] = await Promise.all([
    runVolumeForecastAgent(hub_id),
    runSlaRiskAgent(area_id),
  ]);

  const costResult = await runCostModelingAgent(hub_id, volumeResult.data);

  const partnerResult = await runPartnerEvaluationAgent(
    area_id,
    slaResult.data,
    costResult.data
  );

  logger.info('Partner optimization complete', {
    area_id,
    optimal: partnerResult.data.optimal_partner_name,
  });

  return partnerResult.data;
}
