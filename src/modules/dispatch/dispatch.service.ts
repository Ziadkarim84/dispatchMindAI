import { DispatchDecision } from '@common/types';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runSlaRiskAgent } from '@agents/sla-risk.agent';
import { runPartnerEvaluationAgent } from '@agents/partner-evaluation.agent';
import { runExecutiveSummaryAgent } from '@agents/executive-summary.agent';
import { logger } from '@common/utils/logger.util';
import { query } from '@database/connection';
import { DispatchRecommendInput } from './dispatch.schema';

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
  const { hub_id, area_id } = input;

  logger.info('Starting dispatch recommendation', { hub_id, area_id });

  // Validate hub-area mapping
  const isValidMapping = await validateHubAreaMapping(hub_id, area_id);
  if (!isValidMapping) {
    logger.warn('Proceeding with dispatch despite inactive/missing hub-area mapping', { hub_id, area_id });
  }

  // Agent 1: Volume Forecast
  logger.debug('Running volume forecast agent', { hub_id });
  const volumeResult = await runVolumeForecastAgent(hub_id);

  // Agent 2: Cost Modeling (uses volume forecast)
  logger.debug('Running cost modeling agent', { hub_id });
  const costResult = await runCostModelingAgent(hub_id, volumeResult.data);

  // Agent 3: SLA Risk (runs in parallel with cost modeling output being ready)
  logger.debug('Running SLA risk agent', { area_id });
  const slaResult = await runSlaRiskAgent(area_id);

  // Agent 4: Partner Evaluation (needs SLA + cost results)
  logger.debug('Running partner evaluation agent', { area_id });
  const partnerResult = await runPartnerEvaluationAgent(
    area_id,
    slaResult.data,
    costResult.data
  );

  // Determine dispatch type: prefer 4PL if margin uplift exists and SLA risk is acceptable
  const fourPlModel = costResult.data.find(c => c.scenario === '4PL');
  const threePlModel = costResult.data.find(c => c.scenario === '3PL');
  const fourPlMarginDelta = fourPlModel?.margin_delta_vs_current ?? 0;
  const slaRiskScore = partnerResult.data.sla_risk_score;

  const use4PL =
    fourPlMarginDelta > 0 &&
    slaRiskScore < 60 &&
    partnerResult.data.optimal_partner_id !== 0;

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
    hubId: hub_id,
    areaId: area_id,
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
  dispatchHistory.push({ ...decision, hub_id, area_id, decided_at: new Date().toISOString() });
  if (dispatchHistory.length > 200) dispatchHistory.shift();

  logger.info('Dispatch recommendation complete', { hub_id, area_id, dispatchType, partnerName });
  return decision;
}
