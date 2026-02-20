-- Hub Monthly Costs
-- Stores monthly operational cost breakdown per hub for profitability analysis.
-- One row per hub per month. Update in place for the current month; previous months are historical.

CREATE TABLE IF NOT EXISTS dm_hub_monthly_costs (
  id                INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  hub_id            INT UNSIGNED     NOT NULL COMMENT 'References sl_hubs.ID',
  year              SMALLINT         NOT NULL COMMENT 'e.g. 2025',
  month             TINYINT          NOT NULL COMMENT '1 = January … 12 = December',

  -- Cost components (BDT, monthly totals)
  rent              DECIMAL(12, 2)   NOT NULL DEFAULT 0 COMMENT 'Hub space / premises rent',
  employee_cost     DECIMAL(12, 2)   NOT NULL DEFAULT 0 COMMENT 'Total salaries + allowances for hub staff',
  utility_cost      DECIMAL(12, 2)   NOT NULL DEFAULT 0 COMMENT 'Electricity, water, internet',
  maintenance_cost  DECIMAL(12, 2)   NOT NULL DEFAULT 0 COMMENT 'Equipment upkeep, repairs',
  other_cost        DECIMAL(12, 2)   NOT NULL DEFAULT 0 COMMENT 'Any additional operational cost',

  notes             TEXT             NULL     COMMENT 'Optional context for this month\'s figures',

  created_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_hub_year_month (hub_id, year, month),
  KEY idx_hub_id (hub_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Monthly fixed + operational cost per hub for profitability modeling';
