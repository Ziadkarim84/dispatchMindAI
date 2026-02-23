/**
 * redistribute-partners.ts
 *
 * After fix-dual-partners.ts left all areas as Shopup Internal only,
 * this script redistributes areas between Pathao, Steadfast, and Shopup Internal
 * using bulk SQL (no per-row loops).
 *
 * Distribution plan:
 *   ISD (zone_id=1) + SUB (zone_id=2):  50% Pathao, 17% Steadfast, 33% keep 3PL
 *   OSD (zone_id≥7):                     17% Pathao, 50% Steadfast, 33% keep 3PL
 *
 * Usage:
 *   DB_HOST=... npm run db:redistribute
 */

import 'dotenv/config';
import { query } from '@database/connection';
import { getPool } from '@database/connection';

const PATHAO_ID    = 11;
const STEADFAST_ID = 14;
const SHOPUP_ID    = 3;

async function main() {
  console.log('Connecting to DB:', process.env.DB_HOST, process.env.DB_PORT, process.env.DB_NAME);

  // ── Step 1: Get AREA_IDs currently solely Shopup Internal, partitioned by zone ──
  // We assign a row_number via user variable to enable modulo-based splitting.

  // ISD/SUB: every 6th group → 0,1,2 = Pathao (3/6=50%), 3 = Steadfast (1/6=17%), 4,5 = keep
  // We'll do this with two separate UPDATE batches:
  //   Pathao  = areas where (ROW_NUMBER % 6) IN (0,1,2)  → MOD(area_id,6) IN (0,1,2) approximation
  //   Steadfast = MOD(area_id,6) = 3
  //   Keep 3PL  = MOD(area_id,6) IN (4,5)

  console.log('\n[1] Assigning Pathao to ISD/SUB areas (50% of them)...');
  await query(`
    INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS, CREATED_AT, UPDATED_AT)
    SELECT ap.AREA_ID, ${PATHAO_ID}, 'active', NOW(), NOW()
    FROM sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID IN (1, 2)
      AND MOD(ap.AREA_ID, 6) IN (0, 1, 2)
    ON DUPLICATE KEY UPDATE STATUS = 'active', UPDATED_AT = NOW()
  `);

  // Deactivate Shopup for those ISD/SUB Pathao areas
  await query(`
    UPDATE sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    SET ap.STATUS = 'inactive', ap.UPDATED_AT = NOW()
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID IN (1, 2)
      AND MOD(ap.AREA_ID, 6) IN (0, 1, 2)
  `);
  console.log('  Done.');

  console.log('[2] Assigning Steadfast to ISD/SUB areas (17% of them)...');
  await query(`
    INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS, CREATED_AT, UPDATED_AT)
    SELECT ap.AREA_ID, ${STEADFAST_ID}, 'active', NOW(), NOW()
    FROM sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID IN (1, 2)
      AND MOD(ap.AREA_ID, 6) = 3
    ON DUPLICATE KEY UPDATE STATUS = 'active', UPDATED_AT = NOW()
  `);
  await query(`
    UPDATE sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    SET ap.STATUS = 'inactive', ap.UPDATED_AT = NOW()
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID IN (1, 2)
      AND MOD(ap.AREA_ID, 6) = 3
  `);
  console.log('  Done.');

  console.log('[3] Assigning Steadfast to OSD areas (50% of them)...');
  await query(`
    INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS, CREATED_AT, UPDATED_AT)
    SELECT ap.AREA_ID, ${STEADFAST_ID}, 'active', NOW(), NOW()
    FROM sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID NOT IN (1, 2)
      AND MOD(ap.AREA_ID, 6) IN (0, 1, 2)
    ON DUPLICATE KEY UPDATE STATUS = 'active', UPDATED_AT = NOW()
  `);
  await query(`
    UPDATE sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    SET ap.STATUS = 'inactive', ap.UPDATED_AT = NOW()
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID NOT IN (1, 2)
      AND MOD(ap.AREA_ID, 6) IN (0, 1, 2)
  `);
  console.log('  Done.');

  console.log('[4] Assigning Pathao to OSD areas (17% of them)...');
  await query(`
    INSERT INTO sl_area_partners (AREA_ID, PARTNER_ID, STATUS, CREATED_AT, UPDATED_AT)
    SELECT ap.AREA_ID, ${PATHAO_ID}, 'active', NOW(), NOW()
    FROM sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID NOT IN (1, 2)
      AND MOD(ap.AREA_ID, 6) = 3
    ON DUPLICATE KEY UPDATE STATUS = 'active', UPDATED_AT = NOW()
  `);
  await query(`
    UPDATE sl_area_partners ap
    JOIN sl_areas a ON a.ID = ap.AREA_ID
    SET ap.STATUS = 'inactive', ap.UPDATED_AT = NOW()
    WHERE ap.PARTNER_ID = ${SHOPUP_ID}
      AND ap.STATUS = 'active'
      AND a.ZONE_ID NOT IN (1, 2)
      AND MOD(ap.AREA_ID, 6) = 3
  `);
  console.log('  Done.');

  // ── Final stats ────────────────────────────────────────────────────────────────
  const dist = await query<{ PARTNER_ID: number; partner_name: string; active_count: number }[]>(`
    SELECT ap.PARTNER_ID, dp.NAME AS partner_name, COUNT(*) AS active_count
    FROM sl_area_partners ap
    JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
    WHERE ap.STATUS = 'active'
      AND ap.PARTNER_ID IN (${SHOPUP_ID}, ${PATHAO_ID}, ${STEADFAST_ID})
    GROUP BY ap.PARTNER_ID, dp.NAME
    ORDER BY active_count DESC
  `);
  console.log('\n✓ Final partner distribution:');
  console.table(dist);

  // Hubs with thrpl areas
  const thrplHubs = await query<{ hub_id: number; hub_name: string; thrpl: number; fourpl: number }[]>(`
    SELECT
      ah.HUB_ID   AS hub_id,
      h.HUB_NAME  AS hub_name,
      SUM(ap.PARTNER_ID = ${SHOPUP_ID}) AS thrpl,
      SUM(ap.PARTNER_ID != ${SHOPUP_ID}) AS fourpl
    FROM sl_area_hub ah
    JOIN sl_areas a ON a.ID = ah.AREA_ID
    JOIN sl_hubs h ON h.ID = ah.HUB_ID
    JOIN sl_area_partners ap ON ap.AREA_ID = ah.AREA_ID AND ap.STATUS = 'active'
      AND ap.PARTNER_ID IN (${SHOPUP_ID}, ${PATHAO_ID}, ${STEADFAST_ID})
    WHERE ah.STATUS = 'active'
    GROUP BY ah.HUB_ID, h.HUB_NAME
    HAVING thrpl > 0
    ORDER BY thrpl DESC
    LIMIT 15
  `);
  console.log(`\nHubs with 3PL (thrpl) areas: ${thrplHubs.length}`);
  console.table(thrplHubs);

  await getPool().end();
  console.log('\n✓ Redistribution complete. Rebuild and redeploy to see variety.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
