import { DispatchDecision } from '@common/types';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runSlaRiskAgent } from '@agents/sla-risk.agent';
import { runPartnerEvaluationAgent } from '@agents/partner-evaluation.agent';
import { runExecutiveSummaryAgent } from '@agents/executive-summary.agent';
import { logger } from '@common/utils/logger.util';
import { query } from '@database/connection';
import { NotFoundError } from '@common/errors/not-found.error';
import { DispatchRecommendInput } from './dispatch.schema';

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

async function validateHubAreaMapping(hubId: number, areaId: number): Promise<boolean> {
  const rows = await query<{ STATUS: string }[]>(
    `SELECT STATUS FROM sl_area_hub WHERE HUB_ID = ? AND AREA_ID = ? LIMIT 1`,
    [hubId, areaId]
  );
  if (rows.length === 0) {
    logger.warn('Hub-area combination not found in sl_area_hub', { hubId, areaId });
    return false;
  }
  if (rows[0].STATUS !== 'active') {
    logger.warn('Hub-area combination is not active', { hubId, areaId, status: rows[0].STATUS });
    return false;
  }
  return true;
}

interface DispatchHistoryEntry extends DispatchDecision {
  hub_id: number;
  area_id: number;
  decided_at: string;
}

export const dispatchHistory: DispatchHistoryEntry[] = [];

export async function getDispatchRecommendation(
  input: DispatchRecommendInput
): Promise<DispatchDecision> {
  const { hub_id, area_id, weight, parcel_value, sla_days } = input;
  // API accepts weight in kg (e.g. 1.2); pricing tiers are calculated in grams
  const weightGrams = Math.round(weight * 1000);

  // Resolve hub_id: use provided value or derive from area_id
  const resolvedHubId = hub_id ?? await deriveHubId(area_id);

  logger.info('Starting dispatch recommendation', { hub_id: resolvedHubId, area_id, weightGrams, parcel_value, sla_days });

  // Validate hub-area mapping (only if hub_id was explicitly provided)
  const isValidMapping = hub_id != null
    ? await validateHubAreaMapping(hub_id, area_id)
    : true;
  if (!isValidMapping) {
    logger.warn('Proceeding with dispatch despite inactive/missing hub-area mapping', { hub_id: resolvedHubId, area_id });
  }

  // Agent 1: Volume Forecast
  logger.debug('Running volume forecast agent', { hub_id: resolvedHubId });
  const volumeResult = await runVolumeForecastAgent(resolvedHubId);

  // Agent 2: Cost Modeling (uses volume forecast)
  logger.debug('Running cost modeling agent', { hub_id: resolvedHubId });
  const costResult = await runCostModelingAgent(resolvedHubId, volumeResult.data);

  // Agent 3: SLA Risk — uses merchant's sla_days to calibrate risk thresholds
  logger.debug('Running SLA risk agent', { area_id, sla_days });
  const slaResult = await runSlaRiskAgent(area_id, sla_days);

  // Agent 4: Partner Evaluation — uses actual weight + parcel_value for cost computation
  logger.debug('Running partner evaluation agent', { area_id, weightGrams, parcel_value });
  const partnerResult = await runPartnerEvaluationAgent(
    area_id,
    slaResult.data,
    costResult.data,
    weightGrams,
    parcel_value
  );

  // Determine dispatch type
  const fourPlModel = costResult.data.find(c => c.scenario === '4PL');
  const threePlModel = costResult.data.find(c => c.scenario === '3PL');
  const slaRiskScore = partnerResult.data.sla_risk_score;
  const optimalPartnerId = partnerResult.data.optimal_partner_id;

  // Per-parcel dispatch: prefer 4PL when a valid partner exists with acceptable SLA risk.
  // The cost modeling agent is a hub-level strategic signal (used in executive summary),
  // not a per-parcel gate — 3PL always shows better hub margin since it has no per-parcel
  // fee, which would permanently block 4PL regardless of partner quality or SLA.
  // Guard: Claude returns null for optimal_partner_id when preferring Shopup Internal —
  // null passes !== 0 and !== 3 in JS, so we explicitly require a positive integer.
  const use4PL =
    slaRiskScore < 60 &&
    typeof optimalPartnerId === 'number' &&
    optimalPartnerId > 0 &&
    optimalPartnerId !== 3;

  logger.info('Dispatch decision factors', { slaRiskScore, optimalPartnerId, use4PL });

  const dispatchType: '3PL' | '4PL' = use4PL ? '4PL' : '3PL';
  const partnerName = use4PL
    ? partnerResult.data.optimal_partner_name
    : 'Shopup (Internal)';
  const expectedMargin = use4PL
    ? (fourPlModel?.avg_margin_per_parcel ?? 0)
    : (threePlModel?.avg_margin_per_parcel ?? 0);

  // Agent 6: Executive Summary
  logger.debug('Running executive summary agent');
  const summaryResult = await runExecutiveSummaryAgent({
    hubId: resolvedHubId,
    areaId: area_id,
    weightGrams,
    parcelValue: parcel_value,
    slaDays: sla_days,
    volumeForecast: volumeResult.data,
    costModels: costResult.data,
    slaRisks: slaResult.data,
    partnerRanking: partnerResult.data,
    dispatchType,
  });

  const decision: DispatchDecision = {
    type: dispatchType,
    partner: partnerName,
    expected_margin: expectedMargin,
    risk_score: slaRiskScore,
    confidence: partnerResult.data.confidence,
    summary: summaryResult.data,
  };

  // Keep last 200 decisions in memory
  dispatchHistory.push({ ...decision, hub_id: resolvedHubId, area_id, decided_at: new Date().toISOString() });
  if (dispatchHistory.length > 200) dispatchHistory.shift();

  logger.info('Dispatch recommendation complete', { hub_id: resolvedHubId, area_id, dispatchType, partnerName });
  return decision;
}
