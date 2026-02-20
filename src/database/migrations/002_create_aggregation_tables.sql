-- ─── 6.1 Hub Daily Volume ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dm_hub_daily_volume` (
  `id`          INT          NOT NULL AUTO_INCREMENT,
  `hub_id`      INT          NOT NULL,
  `date`        DATE         NOT NULL,
  `parcel_count` INT         NOT NULL DEFAULT 0,
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_hub_date` (`hub_id`, `date`),
  KEY `idx_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ─── 6.2 Partner SLA Performance ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dm_partner_sla_performance` (
  `id`               INT           NOT NULL AUTO_INCREMENT,
  `partner_id`       INT           DEFAULT NULL,   -- NULL = Shopup internal
  `partner_name`     VARCHAR(255)  NOT NULL,
  `area_id`          INT           NOT NULL,
  `year`             INT           NOT NULL,
  `month`            INT           NOT NULL,
  `total_deliveries` INT           NOT NULL DEFAULT 0,
  `late_deliveries`  INT           NOT NULL DEFAULT 0,
  `breach_rate`      DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_partner_area_month` (`partner_id`, `area_id`, `year`, `month`),
  KEY `idx_area_id` (`area_id`),
  KEY `idx_partner_id` (`partner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- ─── 6.3 Hub Contribution Margin ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `dm_hub_contribution_margin` (
  `id`                   INT           NOT NULL AUTO_INCREMENT,
  `hub_id`               INT           NOT NULL,
  `year`                 INT           NOT NULL,
  `month`                INT           NOT NULL,
  `total_parcels`        INT           NOT NULL DEFAULT 0,
  `delivered_parcels`    INT           NOT NULL DEFAULT 0,
  `returned_parcels`     INT           NOT NULL DEFAULT 0,
  `total_revenue`        DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_4pl_cost`       DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `total_fixed_cost`     DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  `avg_margin_per_parcel` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_hub_month` (`hub_id`, `year`, `month`),
  KEY `idx_hub_id` (`hub_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
