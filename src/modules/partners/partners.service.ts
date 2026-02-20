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

  let volumeResult, slaResult;
  try {
    logger.debug('Running volume forecast + SLA risk agents in parallel', { hub_id, area_id });
    [volumeResult, slaResult] = await Promise.all([
      runVolumeForecastAgent(hub_id),
      runSlaRiskAgent(area_id),
    ]);
    logger.debug('Volume forecast complete', { hub_id, forecast: volumeResult.data });
    logger.debug('SLA risk complete', { area_id, risks: slaResult.data });
  } catch (err) {
    logger.error('Failed in volume forecast or SLA risk agent', {
      hub_id,
      area_id,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  let costResult;
  try {
    logger.debug('Running cost modeling agent', { hub_id });
    costResult = await runCostModelingAgent(hub_id, volumeResult.data);
    logger.debug('Cost modeling complete', { hub_id, models: costResult.data });
  } catch (err) {
    logger.error('Failed in cost modeling agent', {
      hub_id,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  let partnerResult;
  try {
    logger.debug('Running partner evaluation agent', { area_id });
    partnerResult = await runPartnerEvaluationAgent(
      area_id,
      slaResult.data,
      costResult.data
    );
    logger.debug('Partner evaluation complete', { area_id, ranking: partnerResult.data });
  } catch (err) {
    logger.error('Failed in partner evaluation agent', {
      area_id,
      message: (err as Error).message,
      stack: (err as Error).stack,
    });
    throw err;
  }

  logger.info('Partner optimization complete', {
    area_id,
    optimal: partnerResult.data.optimal_partner_name,
    confidence: partnerResult.data.confidence,
    sla_risk_score: partnerResult.data.sla_risk_score,
  });

  return partnerResult.data;
}
