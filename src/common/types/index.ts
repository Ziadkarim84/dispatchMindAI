// ─── DB Entities (mapped from stage1_shopuplite) ──────────────────────────────

export interface Hub {
  ID: number;
  HUB_NAME: string;
  HUB_TYPE: string;
  OPERATIONAL_HUB_TYPE: string | null;
  IS_MH: boolean;
  IS_RMH: boolean;
  IS_CMH: boolean;
  IS_PICKUP: boolean;
  IS_DELIVERY: boolean;
  IS_SORTING: boolean;
  SLA_TIER: string | null;
  SLA_TARGET: number | null;
  STATUS: string;
}

export interface Partner {
  ID: number;
  NAME: string;
  NAME_BN: string | null;
  TYPE: string;
  STATUS: string;
}

// sl_area_partners — maps a delivery area to an available 4PL partner
export interface AreaPartner {
  ID: number;
  AREA_ID: number;
  PARTNER_ID: number;
}

// dm_hub_monthly_costs — new table, one row per hub per month
export interface HubMonthlyCost {
  id: number;
  hub_id: number;
  year: number;
  month: number;
  rent: number;
  employee_cost: number;
  utility_cost: number;
  maintenance_cost: number;
  other_cost: number;
  notes: string | null;
}

// ─── Query Result Shapes ──────────────────────────────────────────────────────

// Agent 1: volume per hub per day
// Source: sl_parcels JOIN sl_logistics_parcel_routes (HUB_ROLE = 'delivery')
export interface HubDailyVolume {
  hub_id: number;
  date: string;         // DATE(sl_parcels.created_at)
  parcel_count: number;
}

// Agent 2: revenue/cost per hub, per parcel status
// Source: sl_parcels grouped by delivery hub + STATUS
export interface HubRevenueRow {
  hub_id: number;
  status: string;       // sl_parcels.STATUS (e.g. 'delivered', 'returned')
  parcel_count: number;
  total_shopup_charge: number;
  total_cod_charge: number;
  total_return_charge: number;
}

// Agent 2: 4PL cost per zone type from sl_fourpl_parcels + sl_fourpl_payments
export interface FourPlCostRow {
  zone_type: 'ISD' | 'SUB' | 'OSD'; // Inside Dhaka / Sub Dhaka / Outside Dhaka
  partner_id: number;
  partner_name: string;
  avg_charge: number;
  parcel_count: number;
}

// Agent 3: SLA performance per partner per area
// Source: sl_parcels + sl_parcel_logs (delivery timestamp vs SLA target)
export interface PartnerSlaStats {
  partner_id: number;
  partner_name: string;
  area_id: number;
  total_deliveries: number;
  late_deliveries: number;
  breach_rate: number;  // late_deliveries / total_deliveries * 100
}

// ─── Agent I/O Types ──────────────────────────────────────────────────────────

export interface AgentResult<T> {
  data: T;
  reasoning: string;
  confidence: number; // 0–100
}

export interface VolumeForecast {
  hub_id: number;
  predicted_daily_avg: number;
  trend: 'growing' | 'shrinking' | 'stable';
  forecast_90d_total: number;
}

export interface CostModelResult {
  hub_id: number;
  scenario: '3PL' | '4PL' | 'Hybrid';
  avg_revenue_per_parcel: number;
  avg_cost_per_parcel: number;    // partner charge (4PL) or internal cost (3PL)
  avg_fixed_cost_per_parcel: number; // dm_hub_monthly_costs / monthly volume
  avg_margin_per_parcel: number;
  margin_delta_vs_current: number;
}

export interface SlaRiskResult {
  partner_id: number;
  partner_name: string;
  area_id: number;
  breach_probability: number; // 0–100
  risk_score: number;         // 0–100
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PartnerRanking {
  optimal_partner_id: number;
  optimal_partner_name: string;
  confidence: number;
  backup_partner_id: number | null;
  backup_partner_name: string | null;
  sla_risk_score: number;
}

export interface HubProfitabilityResult {
  hub_id: number;
  recommendation: 'keep' | 'close' | 'convert';
  projected_margin_90d: number;
  risk_score: number;
}

export interface HubModelRecommendation {
  hub_id: number;
  recommended_model: '3PL' | '4PL' | 'Hybrid';
  margin_uplift: number;
  risk_score: number;
  confidence: number;
  projected_profitability_90d: number;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface DispatchDecision {
  type: '3PL' | '4PL';
  partner: string;
  expected_margin: number;
  risk_score: number;
  confidence: number;
  summary: string;
}
