-- 4PL Partner Pricing
-- Fixed per-parcel pricing for each external (4PL) delivery partner,
-- broken down by zone (1=ISD/Dhaka City, 2=SUB/Dhaka Suburbs, 3=OSD/Outside Dhaka)
-- and weight tier (matching the RedX charging engine tiers).
--
-- Zone IDs in this table use the simplified convention:
--   1 = ISD  (maps to sl_zones.ID = 1)
--   2 = SUB  (maps to sl_zones.ID = 2)
--   3 = OSD  (maps to sl_zones.ID = 7)

CREATE TABLE IF NOT EXISTS `sl_fourpl_partner_pricing` (
  `id`              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  `partner_id`      INT               NOT NULL COMMENT 'References sl_delivery_partners.ID',
  `partner_name`    VARCHAR(100)      NOT NULL,
  `zone_id`         TINYINT UNSIGNED  NOT NULL COMMENT '1=ISD, 2=SUB, 3=OSD',
  `zone_name`       VARCHAR(50)       NOT NULL,

  -- Weight-tier prices (BDT per parcel)
  `kg05_price`      DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤500g',
  `kg1_price`       DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤1000g',
  `kg2_price`       DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤2000g',
  `kg3_price`       DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤3000g',
  `kg4_price`       DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤4000g',
  `kg5_price`       DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Charge for parcels ≤5000g',
  `extended_per_kg` DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Additional BDT per kg above 5kg',

  -- COD & return fees
  `cod_percentage`  DECIMAL(5,2)      NOT NULL DEFAULT 0 COMMENT 'COD fee as % of cash-on-delivery amount',
  `return_charge`   DECIMAL(8,2)      NOT NULL DEFAULT 0 COMMENT 'Fixed return charge (BDT)',

  `status`          ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_partner_zone` (`partner_id`, `zone_id`),
  KEY `idx_partner_id` (`partner_id`),
  KEY `idx_zone_id` (`zone_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Fixed per-zone, per-weight-tier pricing for external 4PL delivery partners';
