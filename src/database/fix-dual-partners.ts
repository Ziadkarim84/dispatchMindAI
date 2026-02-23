/**
 * fix-dual-partners.ts
 *
 * Fixes areas that have BOTH Shopup Internal (partner_id=3) AND a 4PL partner
 * (Pathao=11, Steadfast=14) active simultaneously. These dual-active areas are
 * classified as `is_4pl=true` in hub-summary, masking all 3PL (thrpl) areas.
 *
 * Fix: For every area that has active Shopup Internal, deactivate any other
 *      active partners so the area is cleanly counted as thrpl.
 *
 * Usage (point .env DB_* vars at Railway before running):
 *   npm run db:fix-dual-partners
 */

import 'dotenv/config';
import { query } from '@database/connection';
import { getPool } from '@database/connection';

async function main() {
  console.log('Connecting to DB:', process.env.DB_HOST, process.env.DB_PORT, process.env.DB_NAME);

  // 1. Diagnose: count dual-active areas
  const dualsResult = await query<{ dual_areas: number }[]>(`
    SELECT COUNT(DISTINCT ap1.AREA_ID) AS dual_areas
    FROM sl_area_partners ap1
    JOIN sl_area_partners ap2
      ON ap2.AREA_ID = ap1.AREA_ID
     AND ap2.PARTNER_ID = 3
     AND ap2.STATUS = 'active'
    WHERE ap1.PARTNER_ID != 3
      AND ap1.STATUS = 'active'
  `);
  const dualCount = dualsResult[0]?.dual_areas ?? 0;
  console.log(`\nFound ${dualCount} areas with BOTH Shopup Internal AND a 4PL partner active`);

  if (dualCount === 0) {
    console.log('No dual-active areas — nothing to fix.');
    await getPool().end();
    return;
  }

  // 2. Show sample before fix
  const sampleBefore = await query<{ AREA_ID: number; PARTNER_ID: number; STATUS: string }[]>(`
    SELECT ap1.AREA_ID, ap1.PARTNER_ID, ap1.STATUS
    FROM sl_area_partners ap1
    JOIN sl_area_partners ap2
      ON ap2.AREA_ID = ap1.AREA_ID
     AND ap2.PARTNER_ID = 3
     AND ap2.STATUS = 'active'
    WHERE ap1.PARTNER_ID != 3
      AND ap1.STATUS = 'active'
    LIMIT 10
  `);
  console.log('\nSample dual-active rows (before fix):');
  console.table(sampleBefore);

  // 3. Fix: deactivate all non-Shopup-Internal active partners for areas
  //    that have an active Shopup Internal row
  const result = await query<{ affectedRows: number }>(`
    UPDATE sl_area_partners ap1
    JOIN sl_area_partners ap2
      ON ap2.AREA_ID = ap1.AREA_ID
     AND ap2.PARTNER_ID = 3
     AND ap2.STATUS = 'active'
    SET ap1.STATUS = 'inactive'
    WHERE ap1.PARTNER_ID != 3
      AND ap1.STATUS = 'active'
  `);
  console.log(`\n✓ Deactivated conflicting 4PL partners — affected rows: ${(result as any).affectedRows ?? 'unknown'}`);

  // 4. Verify
  const afterResult = await query<{ dual_areas: number }[]>(`
    SELECT COUNT(DISTINCT ap1.AREA_ID) AS dual_areas
    FROM sl_area_partners ap1
    JOIN sl_area_partners ap2
      ON ap2.AREA_ID = ap1.AREA_ID
     AND ap2.PARTNER_ID = 3
     AND ap2.STATUS = 'active'
    WHERE ap1.PARTNER_ID != 3
      AND ap1.STATUS = 'active'
  `);
  console.log(`Dual-active areas after fix: ${afterResult[0]?.dual_areas ?? 0}`);

  // 5. Show new partner distribution
  const dist = await query<{ PARTNER_ID: number; partner_name: string; active_count: number }[]>(`
    SELECT ap.PARTNER_ID, dp.NAME AS partner_name, COUNT(*) AS active_count
    FROM sl_area_partners ap
    JOIN sl_delivery_partners dp ON dp.ID = ap.PARTNER_ID
    WHERE ap.STATUS = 'active'
    GROUP BY ap.PARTNER_ID, dp.NAME
    ORDER BY active_count DESC
    LIMIT 15
  `);
  console.log('\nNew active partner distribution:');
  console.table(dist);

  // 6. Show thrpl area count per hub (should now be > 0 for many hubs)
  const thrplHubs = await query<{ hub_id: number; hub_name: string; thrpl_areas: number }[]>(`
    SELECT
      ah.HUB_ID   AS hub_id,
      h.HUB_NAME  AS hub_name,
      COUNT(*)    AS thrpl_areas
    FROM sl_area_hub ah
    JOIN sl_areas a ON a.ID = ah.AREA_ID
    JOIN sl_hubs h ON h.ID = ah.HUB_ID
    JOIN sl_area_partners ap ON ap.AREA_ID = ah.AREA_ID AND ap.STATUS = 'active' AND ap.PARTNER_ID = 3
    LEFT JOIN sl_area_partners ap2 ON ap2.AREA_ID = ah.AREA_ID AND ap2.STATUS = 'active' AND ap2.PARTNER_ID != 3
    WHERE ah.STATUS = 'active'
      AND ap2.AREA_ID IS NULL  -- only areas with SOLELY Shopup Internal
    GROUP BY ah.HUB_ID, h.HUB_NAME
    HAVING thrpl_areas > 0
    ORDER BY thrpl_areas DESC
    LIMIT 20
  `);
  console.log(`\nHubs with pure 3PL (thrpl) areas after fix: ${thrplHubs.length}`);
  console.table(thrplHubs);

  await getPool().end();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
