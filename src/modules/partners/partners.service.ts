import { PartnerRanking } from '@common/types';
import { runSlaRiskAgent } from '@agents/sla-risk.agent';
import { runPartnerEvaluationAgent } from '@agents/partner-evaluation.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { logger } from '@common/utils/logger.util';
import { query } from '@database/connection';
import { PartnerOptimizeInput } from './partners.schema';
import { NotFoundError } from '@common/errors/not-found.error';

async function deriveHubId(areaId: number): Promise<number> {
  const rows = await query<{ HUB_ID: number }[]>(
    `SELECT HUB_ID FROM sl_area_hub WHERE AREA_ID = ? AND STATUS = 'active' LIMIT 1`,
    [areaId]
  );
  if (rows.length === 0) {
    throw new NotFoundError('Hub', `area_id=${areaId} (no active hub mapping found)`);
  }
  return rows[0].HUB_ID;
}

export async function getOptimalPartner(input: PartnerOptimizeInput): Promise<PartnerRanking> {
  const { area_id } = input;

  const hub_id = await deriveHubId(area_id);
  logger.info('Derived hub_id from area', { area_id, hub_id });

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
