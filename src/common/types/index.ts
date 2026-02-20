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

export interface PartnerZone {
  ID: number;
  PARTNER_ID: number;
  ZONE_ID: number;
  STATUS: 'preferred' | 'other';
}

export interface HubDailyVolume {
  hub_id: number;
  hub_name: string;
  date: string;
  parcel_count: number;
}

export interface HubMarginSummary {
  hub_id: number;
  hub_name: string;
  avg_shopup_charge: number;
  avg_partner_charge: number;
  avg_subsidy: number;
  avg_cod_charge: number;
  avg_return_charge: number;
  avg_contribution_margin: number;
  parcel_count: number;
}

export interface PartnerSlaStats {
  partner_id: number;
  partner_name: string;
  zone_id: number;
  total_issues: number;
  breached_issues: number;
  breach_rate: number;
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
  avg_margin_per_parcel: number;
  margin_delta_vs_current: number;
}

export interface SlaRiskResult {
  partner_id: number;
  partner_name: string;
  zone_id: number;
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
