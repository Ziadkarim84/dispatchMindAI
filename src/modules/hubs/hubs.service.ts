import { HubModelRecommendation, HubMonthlyCost, HubProfitabilityResult } from '@common/types';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runNetworkStrategyAgent, runHubModelAdvisorAgent } from '@agents/network-strategy.agent';
import { query } from '@database/connection';
import { logger } from '@common/utils/logger.util';

// ─── Hub Profitability ────────────────────────────────────────────────────────

export async function getHubProfitability(hubId: number): Promise<HubProfitabilityResult> {
  logger.info('Starting hub profitability analysis', { hubId });

  const volumeResult = await runVolumeForecastAgent(hubId);
  const costResult = await runCostModelingAgent(hubId, volumeResult.data);
  const strategyResult = await runNetworkStrategyAgent(hubId, volumeResult.data, costResult.data);

  logger.info('Hub profitability analysis complete', { hubId, recommendation: strategyResult.data.recommendation });
  return strategyResult.data;
}

// ─── Hub Model Advice ─────────────────────────────────────────────────────────

export async function getHubModelAdvice(hubId: number): Promise<HubModelRecommendation> {
  logger.info('Starting hub model advice', { hubId });

  const volumeResult = await runVolumeForecastAgent(hubId);
  const costResult = await runCostModelingAgent(hubId, volumeResult.data);
  const advisorResult = await runHubModelAdvisorAgent(hubId, volumeResult.data, costResult.data);

  logger.info('Hub model advice complete', { hubId, model: advisorResult.data.recommended_model });
  return advisorResult.data;
}

// ─── Hub Monthly Costs CRUD ───────────────────────────────────────────────────

export interface UpsertHubCostInput {
  hub_id: number;
  year: number;
  month: number;
  rent: number;
  employee_cost: number;
  utility_cost: number;
  maintenance_cost: number;
  other_cost: number;
  notes?: string;
}

export async function upsertHubCost(input: UpsertHubCostInput): Promise<HubMonthlyCost> {
  await query(
    `INSERT INTO dm_hub_monthly_costs
       (hub_id, year, month, rent, employee_cost, utility_cost, maintenance_cost, other_cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       rent              = VALUES(rent),
       employee_cost     = VALUES(employee_cost),
       utility_cost      = VALUES(utility_cost),
       maintenance_cost  = VALUES(maintenance_cost),
       other_cost        = VALUES(other_cost),
       notes             = VALUES(notes)`,
    [
      input.hub_id,
      input.year,
      input.month,
      input.rent,
      input.employee_cost,
      input.utility_cost,
      input.maintenance_cost,
      input.other_cost,
      input.notes ?? null,
    ]
  );

  const rows = await query<HubMonthlyCost[]>(
    `SELECT * FROM dm_hub_monthly_costs
     WHERE hub_id = ? AND year = ? AND month = ?`,
    [input.hub_id, input.year, input.month]
  );
  return rows[0];
}

export async function getHubCosts(
  hubId: number,
  year?: number,
  month?: number
): Promise<HubMonthlyCost[]> {
  if (year && month) {
    return query<HubMonthlyCost[]>(
      `SELECT * FROM dm_hub_monthly_costs WHERE hub_id = ? AND year = ? AND month = ?`,
      [hubId, year, month]
    );
  }
  return query<HubMonthlyCost[]>(
    `SELECT * FROM dm_hub_monthly_costs WHERE hub_id = ? ORDER BY year DESC, month DESC`,
    [hubId]
  );
}
