import { HubModelRecommendation, HubMonthlyCost, HubProfitabilityResult, HubSummaryResult } from '@common/types';
import { runVolumeForecastAgent } from '@agents/volume-forecast.agent';
import { runCostModelingAgent } from '@agents/cost-modeling.agent';
import { runNetworkStrategyAgent, runHubModelAdvisorAgent } from '@agents/network-strategy.agent';
import { runHubSummaryAgent } from '@agents/hub-summary.agent';
import { query } from '@database/connection';
import { logger } from '@common/utils/logger.util';

// ─── Hub List ─────────────────────────────────────────────────────────────────

export interface HubListItem {
  id: number;
  name: string;
  operational_code: string | null;
}

export async function getAllHubs(): Promise<HubListItem[]> {
  return query<HubListItem[]>(
    `SELECT ID AS id, HUB_NAME AS name, OPERATIONAL_CODE AS operational_code
     FROM sl_hubs
     WHERE STATUS = 'active' AND IS_DELIVERY = 1
     ORDER BY HUB_NAME ASC`,
  );
}

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

// ─── Hub Summary ──────────────────────────────────────────────────────────────

export async function getHubSummary(): Promise<HubSummaryResult> {
  logger.info('Starting hub summary analysis');
  const result = await runHubSummaryAgent();
  logger.info('Hub summary complete', {
    total_hubs: result.data.total_hubs,
    losing_hubs: result.data.losing_hubs,
  });
  return result.data;
}

// ─── Assign Area Partners ─────────────────────────────────────────────────────

export interface PartnerAssignment {
  area_id: number;
  partner_id: number;
}

export interface AssignmentResult {
  area_id: number;
  partner_id: number;
  partner_name: string;
  status: 'assigned' | 'failed';
  error?: string;
}

export async function assignAreaPartners(
  assignments: PartnerAssignment[]
): Promise<AssignmentResult[]> {
  logger.info('Assigning area partners', { count: assignments.length });

  const results: AssignmentResult[] = [];

  for (const { area_id, partner_id } of assignments) {
    try {
      // Deactivate all current active partner entries for this area
      await query(
        `UPDATE sl_area_partners SET STATUS = 'inactive' WHERE AREA_ID = ?`,
        [area_id]
      );

      // Insert or re-activate the new partner assignment
      await query(
        `INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS)
         VALUES (?, ?, 'active')
         ON DUPLICATE KEY UPDATE STATUS = 'active'`,
        [area_id, partner_id]
      );

      const partnerRows = await query<{ NAME: string }[]>(
        `SELECT NAME FROM sl_delivery_partners WHERE ID = ? LIMIT 1`,
        [partner_id]
      );
      const partner_name = partnerRows[0]?.NAME ?? (partner_id === 3 ? 'Shopup Internal' : `Partner ${partner_id}`);

      results.push({ area_id, partner_id, partner_name, status: 'assigned' });
      logger.debug('Area partner assigned', { area_id, partner_id, partner_name });
    } catch (err) {
      logger.error('Failed to assign partner for area', {
        area_id,
        partner_id,
        message: (err as Error).message,
      });
      results.push({ area_id, partner_id, partner_name: '', status: 'failed', error: (err as Error).message });
    }
  }

  const succeeded = results.filter(r => r.status === 'assigned').length;
  logger.info('Area partner assignment complete', { total: assignments.length, succeeded });
  return results;
}

// ─── Hub Monthly Costs CRUD ───────────────────────────────────────────────────

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
