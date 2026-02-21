/**
 * Demo Seed Script
 * Generates realistic dummy data for DispatchMindAI demo:
 *  - Activates 4 real 4PL partners with varied SLA profiles
 *  - Adds 20,000 parcels/day across 10 Dhaka-area hubs for last 30 days
 *  - Populates dm_* aggregation tables for full 90-day window
 *  - Sets hub costs at realistic Bangladesh logistics levels
 *
 * Run with: npm run db:seed-demo
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';

// ─── Config ───────────────────────────────────────────────────────────────────

const FOCUS_HUBS: Record<number, number> = {
  2: 3500,   // Tejgaon Hub
  1: 2500,   // Kalabagan Hub
  3: 2200,   // Mirpur Hub
  5: 2000,   // Uttara Hub
  4: 1800,   // Malibagh Hub
  9: 1500,   // Jatrabari Hub
  11: 1500,  // Tongi Hub
  12: 1800,  // Savar Hub
  14: 1500,  // Narayanganj Hub
  15: 1700,  // Comilla Hub
}; // total = 20,000 / day

const PARTNERS = [
  { id: 11, name: 'Pathao',       charge: 62, baseBreachPct: 8  },
  { id: 14, name: 'Steadfast',    charge: 65, baseBreachPct: 12 },
  { id: 8,  name: 'Paper Fly',    charge: 68, baseBreachPct: 18 },
  { id: 7,  name: 'SA Paribahan', charge: 55, baseBreachPct: 25 },
];

// Monthly breach variation matrix [partner_index][month_offset 0=oldest]
// 6 months, creates interesting partner ranking changes over time
const BREACH_MATRIX: number[][] = [
  //  M-5  M-4  M-3  M-2  M-1  M-0
  [  10,   8,  15,   7,  12,   6 ],  // Pathao
  [  14,  11,   9,  18,  10,   8 ],  // Steadfast — dips month 3 (wins), spikes month 4
  [  20,  22,  17,  19,  16,  14 ],  // Paper Fly — steady decline (improving)
  [  28,  24,  30,  22,  26,  20 ],  // SA Paribahan — cheapest but unreliable
];

// Revenue params (BDT)
const AVG_CHARGE = 88;           // delivery charge
const COD_RATE   = 0.62;         // fraction of delivered parcels with COD
const AVG_COD    = 28;           // COD charge
const AVG_RETURN = 46;           // return charge

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

async function getConnection(): Promise<mysql.Connection> {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 3307),
    user:     process.env.DB_USER     ?? 'dispatch',
    password: process.env.DB_PASSWORD ?? 'dispatch123',
    database: process.env.DB_NAME     ?? 'dispatch_mind_ai',
    multipleStatements: true,
  });
  await conn.query(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);
  await conn.query(`SET foreign_key_checks = 0`);
  return conn;
}

async function batchInsert(
  conn: mysql.Connection,
  table: string,
  columns: string[],
  rows: any[][],
  batchSize = 2000
) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
    await conn.query(
      `INSERT IGNORE INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`,
      batch.flat()
    );
  }
}

// ─── Steps ────────────────────────────────────────────────────────────────────

async function activatePartners(conn: mysql.Connection) {
  console.log('Activating 4PL partners...');
  for (const p of PARTNERS) {
    await conn.query(
      `UPDATE sl_delivery_partners SET STATUS='active' WHERE ID=?`,
      [p.id]
    );
  }
  console.log(`  activated ${PARTNERS.length} partners`);
}

async function seedAreaPartners(conn: mysql.Connection, hubAreas: Map<number, number[]>) {
  console.log('Seeding area_partners...');
  // Remove old demo entries for these partners
  await conn.query(
    `DELETE FROM sl_area_partners WHERE PARTNER_ID IN (${PARTNERS.map(p=>p.id).join(',')})`
  );

  const rows: any[][] = [];
  for (const [, areaIds] of hubAreas) {
    for (const areaId of areaIds) {
      for (const p of PARTNERS) {
        rows.push([areaId, p.id, 'active']);
      }
    }
  }
  await batchInsert(conn, 'sl_area_partners', ['AREA_ID','PARTNER_ID','STATUS'], rows);
  console.log(`  inserted ${rows.length} area_partner rows`);
}

async function seedHubCosts(conn: mysql.Connection) {
  console.log('Seeding hub monthly costs...');
  // Realistic costs for Bangladesh delivery hubs (BDT/month)
  const costProfiles: Record<number, [number,number,number,number,number]> = {
    2:  [55000, 180000, 18000, 10000, 5000],  // Tejgaon — large hub
    1:  [45000, 150000, 15000,  8000, 4000],  // Kalabagan
    3:  [48000, 155000, 15500,  8500, 4200],  // Mirpur
    5:  [42000, 140000, 14000,  7500, 3800],  // Uttara
    4:  [40000, 135000, 13500,  7000, 3500],  // Malibagh
    9:  [35000, 115000, 11500,  6000, 3000],  // Jatrabari
    11: [38000, 120000, 12000,  6500, 3200],  // Tongi
    12: [36000, 118000, 11800,  6200, 3100],  // Savar
    14: [32000, 105000, 10500,  5500, 2800],  // Narayanganj
    15: [30000,  98000,  9800,  5000, 2500],  // Comilla
  };

  // Insert for last 6 months
  const now = new Date();
  for (let m = 0; m < 6; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    for (const [hubId, [rent, emp, util, maint, other]] of Object.entries(costProfiles)) {
      // slight monthly variation ±5%
      const v = (x: number) => Math.round(x * (0.95 + Math.random() * 0.10));
      await conn.query(`
        INSERT INTO dm_hub_monthly_costs
          (hub_id, year, month, rent, employee_cost, utility_cost, maintenance_cost, other_cost, notes)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON DUPLICATE KEY UPDATE
          rent=VALUES(rent), employee_cost=VALUES(employee_cost),
          utility_cost=VALUES(utility_cost), maintenance_cost=VALUES(maintenance_cost),
          other_cost=VALUES(other_cost)`,
        [Number(hubId), yr, mo, v(rent), v(emp), v(util), v(maint), v(other), 'demo-seed']
      );
    }
  }
  console.log('  done');
}

async function seedDmDailyVolume(conn: mysql.Connection) {
  console.log('Seeding dm_hub_daily_volume (90 days)...');
  await conn.query(`DELETE FROM dm_hub_daily_volume WHERE hub_id IN (${Object.keys(FOCUS_HUBS).join(',')})`);

  const today = new Date();
  const rows: any[][] = [];
  for (let d = 89; d >= 0; d--) {
    const dt = addDays(today, -d);
    const isWeekend = dt.getDay() === 5 || dt.getDay() === 6; // Fri/Sat lower in BD
    for (const [hubId, baseVol] of Object.entries(FOCUS_HUBS)) {
      const factor = isWeekend ? 0.75 : (0.90 + Math.random() * 0.20);
      const count = Math.round(Number(baseVol) * factor);
      rows.push([Number(hubId), dateStr(dt), count]);
    }
  }
  await batchInsert(conn, 'dm_hub_daily_volume',
    ['hub_id','date','parcel_count'], rows);
  console.log(`  inserted ${rows.length} daily volume rows`);
}

async function seedDmContributionMargin(conn: mysql.Connection) {
  console.log('Seeding dm_hub_contribution_margin (6 months)...');
  await conn.query(`DELETE FROM dm_hub_contribution_margin WHERE hub_id IN (${Object.keys(FOCUS_HUBS).join(',')})`);

  const now = new Date();
  const rows: any[][] = [];

  for (let m = 0; m < 6; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const daysInMonth = new Date(yr, mo, 0).getDate();

    for (const [hubId, dailyVol] of Object.entries(FOCUS_HUBS)) {
      const total = Math.round(dailyVol * daysInMonth * (0.92 + Math.random() * 0.16));
      const delivered = Math.round(total * (0.70 + Math.random() * 0.05));
      const returned  = Math.round(total * (0.18 + Math.random() * 0.04));

      // Revenue: delivered parcels earn charge+cod_charge, returned earn return_charge
      const deliveredCod = Math.round(delivered * COD_RATE);
      const revenue = Math.round(
        delivered * AVG_CHARGE +
        deliveredCod * AVG_COD +
        returned * AVG_RETURN
      );

      // 4PL cost: 15% of parcels go via 4PL at avg 63 BDT
      const fourplParcels = Math.round(total * 0.15);
      const fourplCost    = Math.round(fourplParcels * 63);

      // Fixed cost from costs table (approx)
      const fixedCost = await getHubFixedCost(conn, Number(hubId), yr, mo);

      const avgMargin = total > 0
        ? Math.round(((revenue - fourplCost - fixedCost) / total) * 100) / 100
        : 0;

      rows.push([
        Number(hubId), yr, mo,
        total, delivered, returned,
        revenue, fourplCost, fixedCost, avgMargin
      ]);
    }
  }

  await batchInsert(conn, 'dm_hub_contribution_margin', [
    'hub_id','year','month','total_parcels','delivered_parcels','returned_parcels',
    'total_revenue','total_4pl_cost','total_fixed_cost','avg_margin_per_parcel'
  ], rows);
  console.log(`  inserted ${rows.length} margin rows`);
}

async function getHubFixedCost(conn: mysql.Connection, hubId: number, yr: number, mo: number): Promise<number> {
  const [rows] = await conn.query<any[]>(`
    SELECT COALESCE(SUM(rent+employee_cost+utility_cost+maintenance_cost+other_cost),0) AS total
    FROM dm_hub_monthly_costs WHERE hub_id=? AND year=? AND month=?`, [hubId, yr, mo]);
  return rows[0]?.total ?? 0;
}

async function seedDmPartnerSla(conn: mysql.Connection, hubAreas: Map<number, number[]>) {
  console.log('Seeding dm_partner_sla_performance (6 months, varied)...');
  await conn.query(`DELETE FROM dm_partner_sla_performance WHERE partner_id IN (${PARTNERS.map(p=>p.id).join(',')})`);

  const now = new Date();
  const rows: any[][] = [];

  for (let m = 0; m < 6; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const monthOffset = 5 - m; // oldest month = index 0

    for (const [hubId, areaIds] of hubAreas) {
      const dailyVol = FOCUS_HUBS[hubId] ?? 1000;
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const totalParcels = Math.round(dailyVol * daysInMonth * 0.15); // 15% are 4PL
      const parcelsPerAreaPerPartner = Math.max(1, Math.floor(totalParcels / (areaIds.length * PARTNERS.length)));

      for (let pi = 0; pi < PARTNERS.length; pi++) {
        const p = PARTNERS[pi];
        // Base breach from matrix + per-hub variation + per-area noise
        const baseBreachPct = BREACH_MATRIX[pi][monthOffset];

        for (const areaId of areaIds) {
          // Add per-area noise ±4%
          const noise = (Math.random() - 0.5) * 8;
          const breachPct = Math.max(1, Math.min(60, baseBreachPct + noise));
          const totalDeliveries = parcelsPerAreaPerPartner + rand(-2, 5);
          if (totalDeliveries < 1) continue;
          const lateDeliveries = Math.round(totalDeliveries * breachPct / 100);
          const actualBreachRate = Math.round((lateDeliveries / totalDeliveries) * 10000) / 100;

          rows.push([p.id, p.name, areaId, yr, mo, totalDeliveries, lateDeliveries, actualBreachRate]);
        }
      }
    }
  }

  await batchInsert(conn, 'dm_partner_sla_performance', [
    'partner_id','partner_name','area_id','year','month',
    'total_deliveries','late_deliveries','breach_rate'
  ], rows);
  console.log(`  inserted ${rows.length} SLA performance rows`);
}

async function seedParcels(conn: mysql.Connection, hubAreas: Map<number, number[]>) {
  console.log('Seeding sl_parcels + routes + logs + fourpl (30 days)...');

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  // Get next available IDs
  const [[maxParcel]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),7900000) AS m FROM sl_parcels');
  let parcelId = Number(maxParcel.m) + 1;

  const [[maxRoute]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_logistics_parcel_routes');
  let routeId = Number(maxRoute.m) + 1;

  const [[maxLog]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_parcel_logs');
  let logId = Number(maxLog.m) + 1;

  const [[maxFourpl]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_fourpl_parcels');
  let fourplId = Number(maxFourpl.m) + 1;

  const parcelRows: any[][] = [];
  const routeRows: any[][] = [];
  const logRows: any[][] = [];
  const fourplRows: any[][] = [];

  const FLUSH_SIZE = 3000;

  async function flush() {
    if (parcelRows.length) {
      await batchInsert(conn, 'sl_parcels',
        ['ID','SHOP_ID','AREA_ID','STATUS','SHOPUP_CHARGE','SHOPUP_COD_CHARGE',
         'SHOPUP_RETURN_CHARGE','PARTNER_ID','TRACKING_ID','PICKUP_AREA_ID','CREATED_AT','UPDATED_AT'],
        parcelRows.splice(0));
    }
    if (routeRows.length) {
      await batchInsert(conn, 'sl_logistics_parcel_routes',
        ['ID','PARCEL_ID','HUB_ID','HUB_ROLE','SERIAL','CREATED_AT','UPDATED_AT'],
        routeRows.splice(0));
    }
    if (logRows.length) {
      await batchInsert(conn, 'sl_parcel_logs',
        ['ID','PARCEL_ID','ACTION','STATUS','SOURCE_HUB_ID','CREATED_AT','UPDATED_AT'],
        logRows.splice(0));
    }
    if (fourplRows.length) {
      await batchInsert(conn, 'sl_fourpl_parcels',
        ['ID','FOURPL_NAME','TRACKING_ID','FOURPL_STATUS','HUB_ID',
         'FOURPL_DELIVERY_CHARGE','CREATED_AT','UPDATED_AT'],
        fourplRows.splice(0));
    }
  }

  let dayCount = 0;
  for (let daysAgo = 29; daysAgo >= 0; daysAgo--) {
    const day = addDays(today, -daysAgo);
    const isWeekend = day.getDay() === 5 || day.getDay() === 6;

    for (const [hubId, baseVol] of Object.entries(FOCUS_HUBS)) {
      const hid = Number(hubId);
      const areaIds = hubAreas.get(hid) ?? [1];
      const vol = Math.round(baseVol * (isWeekend ? 0.75 : (0.90 + Math.random() * 0.20)));

      for (let i = 0; i < vol; i++) {
        const roll = Math.random();
        let status: string, charge: number, codCharge: number, returnCharge: number;

        if (roll < 0.72) {
          status = 'delivered';
          charge = rand(80, 100);
          codCharge = Math.random() < COD_RATE ? rand(20, 40) : 0;
          returnCharge = 0;
        } else if (roll < 0.92) {
          status = 'shopup-returned';
          charge = rand(80, 100);
          codCharge = 0;
          returnCharge = rand(40, 55);
        } else {
          status = 'pickup-pending';
          charge = rand(80, 100);
          codCharge = 0;
          returnCharge = 0;
        }

        // 15% go via 4PL
        const use4pl = Math.random() < 0.15;
        const partner = use4pl ? PARTNERS[rand(0, PARTNERS.length - 1)] : null;
        const areaId  = areaIds[i % areaIds.length];
        const trackId = `DEMO${hid}${dateStr(day).replace(/-/g,'')}${i.toString().padStart(5,'0')}`;

        const createdAt = new Date(day);
        createdAt.setHours(rand(8, 20), rand(0, 59), rand(0, 59));
        const receivedAt = new Date(createdAt.getTime() + rand(30, 120) * 60000);
        const deliveredAt = status === 'delivered'
          ? new Date(receivedAt.getTime() + rand(2, 8) * 3600000)
          : null;

        // sl_parcels
        parcelRows.push([
          parcelId, 1, areaId, status, charge, codCharge, returnCharge,
          partner?.id ?? null, trackId, areaId,
          createdAt, createdAt
        ]);

        // sl_logistics_parcel_routes — delivery role only (serial 4)
        routeRows.push([routeId++, parcelId, hid, 'delivery', 4, createdAt, createdAt]);

        // sl_parcel_logs — received-from-seller
        logRows.push([logId++, parcelId, 'received-from-seller', 'ready-for-delivery',
                      hid, receivedAt, receivedAt]);

        // sl_parcel_logs — delivery/return event
        if (status === 'delivered' && deliveredAt) {
          logRows.push([logId++, parcelId,
            partner ? 'fourpl-status-update' : 'user-delivered',
            'delivered', hid, deliveredAt, deliveredAt]);
        } else if (status === 'shopup-returned') {
          const retAt = new Date(receivedAt.getTime() + rand(1,3) * 86400000);
          logRows.push([logId++, parcelId, 'received-problematic-parcel',
            'shopup-returning', hid, retAt, retAt]);
        }

        // sl_fourpl_parcels
        if (partner && status === 'delivered') {
          fourplRows.push([
            fourplId++, partner.name, trackId, 'delivered', hid,
            partner.charge + rand(-3, 3), createdAt, createdAt
          ]);
        }

        parcelId++;

        if (parcelRows.length >= FLUSH_SIZE) await flush();
      }
    }
    dayCount++;
    if (dayCount % 5 === 0) {
      process.stdout.write(`  ${dayCount}/30 days seeded...\r`);
    }
  }

  await flush();
  console.log('\n  done seeding parcel data');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const conn = await getConnection();
  try {
    console.log('Starting demo seed...\n');

    // Collect areas per hub (up to 20 areas each — enough for meaningful SLA variation)
    const hubAreas = new Map<number, number[]>();
    for (const hubId of Object.keys(FOCUS_HUBS).map(Number)) {
      const [rows] = await conn.query<any[]>(
        `SELECT AREA_ID FROM sl_area_hub WHERE HUB_ID=? AND STATUS='active' LIMIT 20`,
        [hubId]
      );
      hubAreas.set(hubId, rows.map((r: any) => r.AREA_ID));
    }

    await activatePartners(conn);
    await seedHubCosts(conn);
    await seedAreaPartners(conn, hubAreas);
    await seedDmDailyVolume(conn);
    await seedDmContributionMargin(conn);
    await seedDmPartnerSla(conn, hubAreas);
    await seedParcels(conn, hubAreas);

    console.log('\nDemo seed complete.');
  } finally {
    await conn.query(`SET foreign_key_checks = 1`);
    await conn.end();
  }
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
