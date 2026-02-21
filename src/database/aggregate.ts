/**
 * Aggregation Script
 * Populates the three dm_* aggregation tables from live data.
 * Run with: npm run db:aggregate
 *
 * Tables populated:
 *  - dm_hub_daily_volume       (last 90 days, per hub per day)
 *  - dm_partner_sla_performance (last 6 months, per partner per area per month)
 *  - dm_hub_contribution_margin (last 6 months, per hub per month)
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';

const DELIVERED_STATUSES = `'delivered','cash-received','delivery-payment-collected','delivery-payment-sent','hub-payment-collected'`;
const RETURNED_STATUSES = `'shopup-returning','shopup-returned'`;

async function getConnection(): Promise<mysql.Connection> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3307),
    user: process.env.DB_USER ?? 'dispatch',
    password: process.env.DB_PASSWORD ?? 'dispatch123',
    database: process.env.DB_NAME ?? 'dispatch_mind_ai',
    multipleStatements: true,
  });
  await conn.query(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);
  return conn;
}

// ─── 6.1 Hub Daily Volume ──────────────────────────────────────────────────────

async function populateHubDailyVolume(conn: mysql.Connection): Promise<void> {
  console.log('Populating dm_hub_daily_volume...');

  await conn.query(`
    INSERT INTO dm_hub_daily_volume (hub_id, date, parcel_count)
    SELECT
      r.HUB_ID          AS hub_id,
      DATE(p.created_at) AS date,
      COUNT(*)           AS parcel_count
    FROM sl_parcels p
    JOIN sl_logistics_parcel_routes r
      ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
    WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)
    GROUP BY r.HUB_ID, DATE(p.created_at)
    ON DUPLICATE KEY UPDATE
      parcel_count = VALUES(parcel_count),
      updated_at   = NOW()
  `);

  const [[{ cnt }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM dm_hub_daily_volume`
  ) as any;
  console.log(`  done — ${cnt} rows`);
}

// ─── 6.2 Partner SLA Performance ──────────────────────────────────────────────

async function populatePartnerSlaPerformance(conn: mysql.Connection): Promise<void> {
  console.log('Populating dm_partner_sla_performance...');

  await conn.query(`
    INSERT INTO dm_partner_sla_performance
      (partner_id, partner_name, area_id, year, month, total_deliveries, late_deliveries, breach_rate)
    SELECT
      p.PARTNER_ID,
      COALESCE(dp.NAME, 'Shopup (Internal)')                    AS partner_name,
      p.AREA_ID                                                  AS area_id,
      YEAR(p.created_at)                                         AS year,
      MONTH(p.created_at)                                        AS month,
      COUNT(*)                                                    AS total_deliveries,
      SUM(
        CASE
          WHEN DATEDIFF(DATE(dlv.delivered_at), DATE(rfs.received_at))
               > COALESCE(h.SLA_TARGET, 3)
          THEN 1 ELSE 0
        END
      )                                                           AS late_deliveries,
      ROUND(
        SUM(
          CASE
            WHEN DATEDIFF(DATE(dlv.delivered_at), DATE(rfs.received_at))
                 > COALESCE(h.SLA_TARGET, 3)
            THEN 1 ELSE 0
          END
        ) * 100.0 / COUNT(*), 2
      )                                                           AS breach_rate
    FROM sl_parcels p
    JOIN sl_logistics_parcel_routes r
      ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
    JOIN sl_hubs h ON h.ID = r.HUB_ID
    LEFT JOIN sl_delivery_partners dp ON dp.ID = p.PARTNER_ID
    JOIN (
      SELECT PARCEL_ID, MIN(created_at) AS received_at
      FROM sl_parcel_logs
      WHERE ACTION = 'received-from-seller'
      GROUP BY PARCEL_ID
    ) rfs ON rfs.PARCEL_ID = p.ID
    JOIN (
      SELECT PARCEL_ID, MIN(created_at) AS delivered_at
      FROM sl_parcel_logs
      WHERE STATUS IN (${DELIVERED_STATUSES})
      GROUP BY PARCEL_ID
    ) dlv ON dlv.PARCEL_ID = p.ID
    WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY p.PARTNER_ID, dp.NAME, p.AREA_ID, YEAR(p.created_at), MONTH(p.created_at)
    HAVING total_deliveries > 0
    ON DUPLICATE KEY UPDATE
      total_deliveries = VALUES(total_deliveries),
      late_deliveries  = VALUES(late_deliveries),
      breach_rate      = VALUES(breach_rate),
      updated_at       = NOW()
  `);

  const [[{ cnt }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM dm_partner_sla_performance`
  ) as any;
  console.log(`  done — ${cnt} rows`);
}

// ─── 6.3 Hub Contribution Margin ──────────────────────────────────────────────

async function populateHubContributionMargin(conn: mysql.Connection): Promise<void> {
  console.log('Populating dm_hub_contribution_margin...');

  await conn.query(`
    INSERT INTO dm_hub_contribution_margin
      (hub_id, year, month, total_parcels, delivered_parcels, returned_parcels,
       total_revenue, total_4pl_cost, total_fixed_cost, avg_margin_per_parcel)
    SELECT
      r.HUB_ID                                                    AS hub_id,
      YEAR(p.created_at)                                          AS year,
      MONTH(p.created_at)                                         AS month,
      COUNT(*)                                                     AS total_parcels,
      SUM(CASE WHEN p.STATUS IN (${DELIVERED_STATUSES}) THEN 1 ELSE 0 END) AS delivered_parcels,
      SUM(CASE WHEN p.STATUS IN (${RETURNED_STATUSES})  THEN 1 ELSE 0 END) AS returned_parcels,
      SUM(
        CASE
          WHEN p.STATUS IN (${DELIVERED_STATUSES})
            THEN COALESCE(p.SHOPUP_CHARGE, 0) + COALESCE(p.SHOPUP_COD_CHARGE, 0)
          WHEN p.STATUS IN (${RETURNED_STATUSES})
            THEN COALESCE(p.SHOPUP_RETURN_CHARGE, 0)
          ELSE 0
        END
      )                                                            AS total_revenue,
      COALESCE((
        SELECT SUM(fp.FOURPL_DELIVERY_CHARGE)
        FROM sl_fourpl_parcels fp
        WHERE fp.HUB_ID            = r.HUB_ID
          AND YEAR(fp.CREATED_AT)  = YEAR(p.created_at)
          AND MONTH(fp.CREATED_AT) = MONTH(p.created_at)
      ), 0)                                                        AS total_4pl_cost,
      COALESCE((
        SELECT rent + employee_cost + utility_cost + maintenance_cost + other_cost
        FROM dm_hub_monthly_costs
        WHERE hub_id = r.HUB_ID
          AND year   = YEAR(p.created_at)
          AND month  = MONTH(p.created_at)
        LIMIT 1
      ), 0)                                                        AS total_fixed_cost,
      0                                                            AS avg_margin_per_parcel
    FROM sl_parcels p
    JOIN sl_logistics_parcel_routes r
      ON r.PARCEL_ID = p.ID AND r.HUB_ROLE = 'delivery'
    WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
    GROUP BY r.HUB_ID, YEAR(p.created_at), MONTH(p.created_at)
    ON DUPLICATE KEY UPDATE
      total_parcels     = VALUES(total_parcels),
      delivered_parcels = VALUES(delivered_parcels),
      returned_parcels  = VALUES(returned_parcels),
      total_revenue     = VALUES(total_revenue),
      total_4pl_cost    = VALUES(total_4pl_cost),
      total_fixed_cost  = VALUES(total_fixed_cost),
      updated_at        = NOW()
  `);

  // Compute avg_margin_per_parcel = (revenue - 4pl_cost - fixed_cost) / total_parcels
  await conn.query(`
    UPDATE dm_hub_contribution_margin
    SET avg_margin_per_parcel = CASE
      WHEN total_parcels > 0
        THEN ROUND((total_revenue - total_4pl_cost - total_fixed_cost) / total_parcels, 2)
      ELSE 0
    END
  `);

  const [[{ cnt }]] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM dm_hub_contribution_margin`
  ) as any;
  console.log(`  done — ${cnt} rows`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const conn = await getConnection();
  try {
    console.log('Starting aggregation...\n');
    await populateHubDailyVolume(conn);
    await populatePartnerSlaPerformance(conn);
    await populateHubContributionMargin(conn);
    console.log('\nAggregation complete.');
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('Aggregation failed:', err.message);
  process.exit(1);
});
