/**
 * Demo Seed Script
 * Generates realistic dummy data for DispatchMindAI demo:
 *  - Creates sl_shop_zones with pricing for demo shops 1-5 (zones ISD/SUB/OSD)
 *  - Creates sl_fourpl_partner_pricing with per-zone, per-weight pricing for 4 partners
 *  - Activates 4 real 4PL partners with varied SLA profiles
 *  - Adds 20,000 parcels/day across 10 Dhaka-area hubs for last 30 days,
 *    with zone-aware charges calculated from sl_shop_zones
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

// Fraction of delivered parcels that have COD
const COD_RATE = 0.62;

// sl_zones zone_id → partner pricing zone_id mapping
// sl_zones: 1=Dhaka City (ISD), 2=Dhaka Suburbs (SUB), 7=Outside Dhaka (OSD)
// partner pricing: 1=ISD, 2=SUB, 3=OSD
function toPartnerZoneId(slZoneId: number): number {
  if (slZoneId === 1) return 1;
  if (slZoneId === 2) return 2;
  return 3;
}

// ─── Pricing Helpers ──────────────────────────────────────────────────────────

/** Random weight in grams with realistic e-commerce distribution */
function getWeightGrams(): number {
  const r = Math.random();
  if (r < 0.40) return 500;    // 40% — small items (phone cases, accessories)
  if (r < 0.70) return 1000;   // 30% — medium items
  if (r < 0.85) return 2000;   // 15% — larger items
  if (r < 0.93) return 3000;   // 8%  — bulky items
  if (r < 0.97) return 5000;   // 4%  — heavy items
  return 7000;                  // 2%  — oversize
}

/** Delivery charge from sl_shop_zones based on weight tier */
function calcDeliveryCharge(sz: Record<string, number>, weightGrams: number): number {
  if (weightGrams <= 500)  return sz['SHOPUP_KG05_PRICE'];
  if (weightGrams <= 1000) return sz['SHOPUP_KG1_PRICE'];
  if (weightGrams <= 2000) return sz['SHOPUP_KG2_PRICE'];
  if (weightGrams <= 3000) return sz['SHOPUP_KG3_PRICE'];
  if (weightGrams <= 4000) return sz['SHOPUP_KG4_PRICE'];
  if (weightGrams <= 5000) return sz['SHOPUP_KG5_PRICE'];
  const extraKg = Math.ceil((weightGrams - 5000) / 1000);
  return sz['SHOPUP_KG5_PRICE'] + extraKg * sz['SHOPUP_EXTENDED_PER_KG'];
}

/** Delivery charge from sl_fourpl_partner_pricing based on weight tier */
function calcPartnerCharge(pp: Record<string, number>, weightGrams: number): number {
  if (weightGrams <= 500)  return pp['kg05_price'];
  if (weightGrams <= 1000) return pp['kg1_price'];
  if (weightGrams <= 2000) return pp['kg2_price'];
  if (weightGrams <= 3000) return pp['kg3_price'];
  if (weightGrams <= 4000) return pp['kg4_price'];
  if (weightGrams <= 5000) return pp['kg5_price'];
  const extraKg = Math.ceil((weightGrams - 5000) / 1000);
  return pp['kg5_price'] + extraKg * pp['extended_per_kg'];
}

// ─── Generic Helpers ──────────────────────────────────────────────────────────

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

// ─── Step 1: Shop Zones ───────────────────────────────────────────────────────

/**
 * Creates sl_shop_zones table (if not already synced from stage DB) and populates
 * demo pricing for shops 1-5 across zones 1 (ISD), 2 (SUB), 7 (OSD).
 *
 * Column meanings:
 *  SHOPUP_KG05_PRICE … SHOPUP_KG5_PRICE : delivery charge by weight tier (BDT)
 *  SHOPUP_COD                            : % of COD cash value charged as fee
 *  SHOPUP_RETURN_PERCENTAGE              : % of delivery charge for returns
 *  SHOPUP_EXTENDED_PER_KG                : extra BDT per kg above 5 kg
 */
async function seedShopZones(conn: mysql.Connection) {
  console.log('Seeding sl_shop_zones for demo shops 1-5...');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sl_shop_zones (
      ID                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
      SHOP_ID                  INT          NOT NULL,
      ZONE_ID                  INT          NOT NULL,
      SHOPUP_KG05_PRICE        DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_KG1_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_KG2_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_KG3_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_KG4_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_KG5_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_MAX_PRICE         DECIMAL(8,2) NOT NULL DEFAULT 0,
      SHOPUP_COD               DECIMAL(5,2) NOT NULL DEFAULT 0,
      SHOPUP_RETURN_PERCENTAGE DECIMAL(5,2) NOT NULL DEFAULT 0,
      SHOPUP_EXTENDED_PER_KG   DECIMAL(8,2) NOT NULL DEFAULT 0,
      CREATED_AT               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UPDATED_AT               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (ID),
      UNIQUE KEY uq_shop_zone (SHOP_ID, ZONE_ID)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // columns order: SHOP_ID, ZONE_ID, KG05, KG1, KG2, KG3, KG4, KG5, MAX, COD%, RETURN%, EXT_PER_KG
  // Zone 1=ISD (Dhaka City), Zone 2=SUB (Dhaka Suburbs), Zone 7=OSD (Outside Dhaka)
  const shopZoneData: any[][] = [
    // Shop 1 — standard SME merchant
    [1, 1,   60,  65,  80,  95, 110, 125, 125, 1.50, 50, 20],
    [1, 2,   80,  88, 105, 120, 135, 150, 150, 1.50, 50, 22],
    [1, 7,  120, 130, 155, 175, 195, 215, 215, 1.50, 50, 25],
    // Shop 2 — slightly negotiated rates
    [2, 1,   58,  63,  77,  91, 105, 120, 120, 1.00, 50, 19],
    [2, 2,   78,  85, 100, 115, 130, 145, 145, 1.00, 50, 21],
    [2, 7,  115, 125, 148, 168, 188, 208, 208, 1.00, 50, 24],
    // Shop 3 — high-volume merchant with premium rates
    [3, 1,   55,  60,  73,  86,  99, 112, 112, 0.50, 40, 18],
    [3, 2,   75,  82,  97, 112, 127, 142, 142, 0.50, 40, 20],
    [3, 7,  110, 120, 143, 163, 183, 203, 203, 0.50, 40, 23],
    // Shop 4 — standard rates
    [4, 1,   62,  68,  83,  98, 113, 128, 128, 1.50, 50, 21],
    [4, 2,   82,  90, 107, 124, 141, 158, 158, 1.50, 50, 23],
    [4, 7,  122, 132, 157, 177, 197, 217, 217, 1.50, 50, 26],
    // Shop 5 — COD-heavy fashion merchant (higher base charge)
    [5, 1,   65,  72,  88, 104, 120, 136, 136, 2.00, 50, 22],
    [5, 2,   85,  93, 112, 131, 150, 169, 169, 2.00, 50, 25],
    [5, 7,  128, 140, 167, 190, 213, 236, 236, 2.00, 50, 28],
  ];

  await batchInsert(conn, 'sl_shop_zones', [
    'SHOP_ID','ZONE_ID',
    'SHOPUP_KG05_PRICE','SHOPUP_KG1_PRICE','SHOPUP_KG2_PRICE','SHOPUP_KG3_PRICE',
    'SHOPUP_KG4_PRICE','SHOPUP_KG5_PRICE','SHOPUP_MAX_PRICE',
    'SHOPUP_COD','SHOPUP_RETURN_PERCENTAGE','SHOPUP_EXTENDED_PER_KG',
  ], shopZoneData);

  console.log(`  inserted ${shopZoneData.length} shop zone rows`);
}

// ─── Step 2: 4PL Partner Pricing ─────────────────────────────────────────────

/**
 * Creates sl_fourpl_partner_pricing table and seeds per-zone, per-weight pricing
 * for all 4 demo partners.  zone_id: 1=ISD, 2=SUB, 3=OSD.
 */
async function seedFourplPartnerPricing(conn: mysql.Connection) {
  console.log('Seeding sl_fourpl_partner_pricing...');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sl_fourpl_partner_pricing (
      id              INT UNSIGNED      NOT NULL AUTO_INCREMENT,
      partner_id      INT               NOT NULL,
      partner_name    VARCHAR(100)      NOT NULL,
      zone_id         TINYINT UNSIGNED  NOT NULL COMMENT '1=ISD, 2=SUB, 3=OSD',
      zone_name       VARCHAR(50)       NOT NULL,
      kg05_price      DECIMAL(8,2)      NOT NULL DEFAULT 0,
      kg1_price       DECIMAL(8,2)      NOT NULL DEFAULT 0,
      kg2_price       DECIMAL(8,2)      NOT NULL DEFAULT 0,
      kg3_price       DECIMAL(8,2)      NOT NULL DEFAULT 0,
      kg4_price       DECIMAL(8,2)      NOT NULL DEFAULT 0,
      kg5_price       DECIMAL(8,2)      NOT NULL DEFAULT 0,
      extended_per_kg DECIMAL(8,2)      NOT NULL DEFAULT 0,
      cod_percentage  DECIMAL(5,2)      NOT NULL DEFAULT 0,
      return_charge   DECIMAL(8,2)      NOT NULL DEFAULT 0,
      status          ENUM('active','inactive') NOT NULL DEFAULT 'active',
      created_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_partner_zone (partner_id, zone_id),
      KEY idx_partner_id (partner_id),
      KEY idx_zone_id (zone_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // columns: partner_id, partner_name, zone_id, zone_name,
  //          kg05, kg1, kg2, kg3, kg4, kg5, ext_per_kg, cod_pct, return_charge
  const pricingData: any[][] = [
    // Pathao (id=11) — best SLA, competitive pricing
    [11,'Pathao',     1,'ISD', 50, 55, 65, 75, 85,  95, 15, 0.00, 30],
    [11,'Pathao',     2,'SUB', 60, 67, 79, 91,103, 115, 18, 0.50, 35],
    [11,'Pathao',     3,'OSD', 85, 95,115,130,145, 160, 22, 0.50, 45],
    // Steadfast (id=14) — reliable, mid-range pricing
    [14,'Steadfast',  1,'ISD', 53, 58, 68, 78, 88,  98, 16, 0.00, 32],
    [14,'Steadfast',  2,'SUB', 63, 70, 83, 96,109, 122, 19, 0.50, 38],
    [14,'Steadfast',  3,'OSD', 90,101,121,137,153, 168, 24, 0.50, 47],
    // Paper Fly (id=8) — higher breach, higher price
    [8, 'Paper Fly',  1,'ISD', 56, 62, 72, 82, 92, 102, 17, 0.00, 33],
    [8, 'Paper Fly',  2,'SUB', 66, 73, 86,100,113, 125, 20, 0.50, 40],
    [8, 'Paper Fly',  3,'OSD', 95,106,126,141,156, 170, 25, 0.50, 50],
    // SA Paribahan (id=7) — cheapest, highest breach rate
    [7, 'SA Paribahan',1,'ISD',45, 50, 58, 67, 76,  85, 13, 0.00, 25],
    [7, 'SA Paribahan',2,'SUB',54, 60, 71, 82, 93, 104, 16, 0.50, 30],
    [7, 'SA Paribahan',3,'OSD',78, 87,104,118,132, 145, 20, 0.50, 38],
  ];

  await conn.query(`DELETE FROM sl_fourpl_partner_pricing WHERE partner_id IN (7,8,11,14)`);
  await batchInsert(conn, 'sl_fourpl_partner_pricing', [
    'partner_id','partner_name','zone_id','zone_name',
    'kg05_price','kg1_price','kg2_price','kg3_price','kg4_price','kg5_price',
    'extended_per_kg','cod_percentage','return_charge',
  ], pricingData);

  console.log(`  inserted ${pricingData.length} partner pricing rows`);
}

// ─── Step 3: Activate Partners ────────────────────────────────────────────────

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

// ─── Step 4: Area Partners ────────────────────────────────────────────────────

async function seedAreaPartners(conn: mysql.Connection, hubAreas: Map<number, number[]>) {
  console.log('Seeding area_partners...');
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

// ─── Step 5: Hub Monthly Costs ────────────────────────────────────────────────

async function seedHubCosts(conn: mysql.Connection) {
  console.log('Seeding hub monthly costs...');
  // Realistic costs for Bangladesh delivery hubs (BDT/month)
  // [rent, employee_cost, utility_cost, maintenance_cost, other_cost]
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

  const now = new Date();
  for (let m = 0; m < 6; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    for (const [hubId, [rent, emp, util, maint, other]] of Object.entries(costProfiles)) {
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

// ─── Step 6: DM Hub Daily Volume ─────────────────────────────────────────────

async function seedDmDailyVolume(conn: mysql.Connection) {
  console.log('Seeding dm_hub_daily_volume (90 days)...');
  await conn.query(`DELETE FROM dm_hub_daily_volume WHERE hub_id IN (${Object.keys(FOCUS_HUBS).join(',')})`);

  const today = new Date();
  const rows: any[][] = [];
  for (let d = 89; d >= 0; d--) {
    const dt = addDays(today, -d);
    const isWeekend = dt.getDay() === 5 || dt.getDay() === 6;
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

// ─── Step 7: DM Contribution Margin (synthetic, 6-month window) ───────────────

async function seedDmContributionMargin(conn: mysql.Connection) {
  console.log('Seeding dm_hub_contribution_margin (6 months)...');
  await conn.query(`DELETE FROM dm_hub_contribution_margin WHERE hub_id IN (${Object.keys(FOCUS_HUBS).join(',')})`);

  const now = new Date();
  const rows: any[][] = [];

  // Avg delivery charge by hub zone profile (blended ISD/SUB/OSD)
  // Comilla (hub 15) has more OSD areas → higher avg charge
  const avgChargeByHub: Record<number, number> = {
    2: 73, 1: 73, 3: 71, 5: 75, 4: 72,
    9: 74, 11: 77, 12: 80, 14: 82, 15: 128,
  };
  const avgReturnByHub: Record<number, number> = {
    2: 37, 1: 37, 3: 36, 5: 38, 4: 36,
    9: 37, 11: 39, 12: 40, 14: 41, 15: 64,
  };

  for (let m = 0; m < 6; m++) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const yr = d.getFullYear();
    const mo = d.getMonth() + 1;
    const daysInMonth = new Date(yr, mo, 0).getDate();

    for (const [hubId, dailyVol] of Object.entries(FOCUS_HUBS)) {
      const hid = Number(hubId);
      const AVG_CHARGE = avgChargeByHub[hid] ?? 75;
      const AVG_RETURN = avgReturnByHub[hid] ?? 38;
      const AVG_COD    = Math.round(AVG_CHARGE * 0.30); // ~30% of charge as COD fee

      const total     = Math.round(dailyVol * daysInMonth * (0.92 + Math.random() * 0.16));
      const delivered = Math.round(total * (0.70 + Math.random() * 0.05));
      const returned  = Math.round(total * (0.18 + Math.random() * 0.04));

      const deliveredCod = Math.round(delivered * COD_RATE);
      const revenue = Math.round(
        delivered * AVG_CHARGE +
        deliveredCod * AVG_COD +
        returned * AVG_RETURN
      );

      const fourplParcels = Math.round(total * 0.15);
      const avgPartnerCharge = 62; // blended across partners
      const fourplCost    = Math.round(fourplParcels * avgPartnerCharge);

      const fixedCost = await getHubFixedCost(conn, hid, yr, mo);

      const avgMargin = total > 0
        ? Math.round(((revenue - fourplCost - fixedCost) / total) * 100) / 100
        : 0;

      rows.push([
        hid, yr, mo,
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

// ─── Step 8: DM Partner SLA ───────────────────────────────────────────────────

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
      const totalParcels = Math.round(dailyVol * daysInMonth * 0.15);
      const parcelsPerAreaPerPartner = Math.max(1, Math.floor(totalParcels / (areaIds.length * PARTNERS.length)));

      for (let pi = 0; pi < PARTNERS.length; pi++) {
        const p = PARTNERS[pi];
        const baseBreachPct = BREACH_MATRIX[pi][monthOffset];

        for (const areaId of areaIds) {
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

// ─── Step 9: Parcels (with zone-aware pricing) ────────────────────────────────

async function cleanDemoParcels(conn: mysql.Connection) {
  console.log('Cleaning old demo parcel data...');
  // Collect IDs of existing DEMO parcels so we can delete child records
  const [demoIds] = await conn.query<any[]>(
    `SELECT ID FROM sl_parcels WHERE TRACKING_ID LIKE 'DEMO%'`
  );
  if (demoIds.length === 0) {
    console.log('  no existing demo parcels found');
    return;
  }
  const ids: number[] = demoIds.map((r: any) => r.ID);
  const chunkSize = 5000;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');
    await conn.query(`DELETE FROM sl_parcel_logs WHERE PARCEL_ID IN (${placeholders})`, chunk);
    await conn.query(`DELETE FROM sl_logistics_parcel_routes WHERE PARCEL_ID IN (${placeholders})`, chunk);
  }
  await conn.query(`DELETE FROM sl_parcels WHERE TRACKING_ID LIKE 'DEMO%'`);
  await conn.query(`DELETE FROM sl_fourpl_parcels WHERE TRACKING_ID LIKE 'DEMO%'`);
  console.log(`  removed ${ids.length} old demo parcels and their child records`);
}

async function seedParcels(conn: mysql.Connection, hubAreas: Map<number, number[]>) {
  console.log('Seeding sl_parcels + routes + logs + fourpl (30 days, zone-aware pricing)...');

  // Pre-load area → zone mapping (sl_zones: 1=ISD, 2=SUB, 7=OSD)
  const [areaRows] = await conn.query<any[]>('SELECT ID, ZONE_ID FROM sl_areas');
  const areaZoneMap = new Map<number, number>();
  for (const r of areaRows) areaZoneMap.set(r.ID, r.ZONE_ID);

  // Pre-load shop zone pricing: key = "shopId_zoneId"
  const [szRows] = await conn.query<any[]>('SELECT * FROM sl_shop_zones WHERE SHOP_ID IN (1,2,3,4,5)');
  const shopZonePricing = new Map<string, Record<string, number>>();
  for (const r of szRows) shopZonePricing.set(`${r.SHOP_ID}_${r.ZONE_ID}`, r);

  // Pre-load partner pricing: key = "partnerId_zoneId" (zone 1=ISD, 2=SUB, 3=OSD)
  const [ppRows] = await conn.query<any[]>(`SELECT * FROM sl_fourpl_partner_pricing WHERE status = 'active'`);
  const partnerPricingMap = new Map<string, Record<string, number>>();
  for (const r of ppRows) partnerPricingMap.set(`${r.partner_id}_${r.zone_id}`, r);

  // Shop IDs to assign to demo parcels (weighted toward common shops)
  const DEMO_SHOPS = [1, 1, 1, 2, 2, 3, 4, 5];

  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const [[maxParcel]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),7900000) AS m FROM sl_parcels');
  let parcelId = Number(maxParcel.m) + 1;

  const [[maxRoute]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_logistics_parcel_routes');
  let routeId = Number(maxRoute.m) + 1;

  const [[maxLog]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_parcel_logs');
  let logId = Number(maxLog.m) + 1;

  const [[maxFourpl]] = await conn.query<any[]>('SELECT COALESCE(MAX(ID),0) AS m FROM sl_fourpl_parcels');
  let fourplId = Number(maxFourpl.m) + 1;

  const parcelRows: any[][] = [];
  const routeRows:  any[][] = [];
  const logRows:    any[][] = [];
  const fourplRows: any[][] = [];

  const FLUSH_SIZE = 3000;

  async function flush() {
    if (parcelRows.length) {
      await batchInsert(conn, 'sl_parcels',
        ['ID','SHOP_ID','AREA_ID','STATUS',
         'SHOPUP_CHARGE','SHOPUP_COD_CHARGE','SHOPUP_RETURN_CHARGE',
         'PARTNER_ID','TRACKING_ID','PICKUP_AREA_ID','WEIGHT','CASH',
         'CREATED_AT','UPDATED_AT'],
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
        const areaId       = areaIds[i % areaIds.length];
        const slZoneId     = areaZoneMap.get(areaId) ?? 7;     // sl_zones zone_id
        const partnerZoneId = toPartnerZoneId(slZoneId);        // 1/2/3 for ISD/SUB/OSD
        const shopId       = DEMO_SHOPS[rand(0, DEMO_SHOPS.length - 1)];
        const weight       = getWeightGrams();

        // Get shop zone pricing (fallback: shop 1 same zone, then shop 1 zone 7)
        const sz =
          shopZonePricing.get(`${shopId}_${slZoneId}`) ??
          shopZonePricing.get(`1_${slZoneId}`) ??
          shopZonePricing.get(`1_7`);

        // Determine status
        const roll = Math.random();
        let status: string;
        if      (roll < 0.72) status = 'delivered';
        else if (roll < 0.92) status = 'shopup-returned';
        else                  status = 'pickup-pending';

        // Delivery charge (BDT)
        let charge: number, codCharge = 0, returnCharge = 0, cashValue = 0;
        if (sz) {
          charge = Math.round(calcDeliveryCharge(sz, weight));

          if (status === 'delivered') {
            // COD applies for 62% of delivered parcels and only if COD rate > 0
            if (Math.random() < COD_RATE && sz['SHOPUP_COD'] > 0) {
              cashValue = rand(800, 2500);
              codCharge = Math.round(cashValue * sz['SHOPUP_COD'] / 100);
            } else if (Math.random() < COD_RATE) {
              // ISD zone has 0% COD — still record a cash value but no COD charge
              cashValue = rand(800, 2500);
              codCharge = 0;
            }
          } else if (status === 'shopup-returned') {
            returnCharge = Math.round(charge * sz['SHOPUP_RETURN_PERCENTAGE'] / 100);
          }
        } else {
          // Fallback if pricing not found
          charge      = rand(70, 100);
          returnCharge = status === 'shopup-returned' ? rand(35, 50) : 0;
        }

        // 4PL assignment (15% of parcels go via a 4PL partner)
        const use4pl  = Math.random() < 0.15;
        const partner = use4pl ? PARTNERS[rand(0, PARTNERS.length - 1)] : null;

        // 4PL charge from partner pricing table (zone + weight aware)
        let fourplCharge = partner?.charge ?? 0;
        if (partner) {
          const pp = partnerPricingMap.get(`${partner.id}_${partnerZoneId}`);
          if (pp) {
            fourplCharge = Math.round(calcPartnerCharge(pp, weight)) + rand(-2, 2);
          }
        }

        const trackId = `DEMO${hid}${dateStr(day).replace(/-/g,'')}${i.toString().padStart(5,'0')}`;

        const createdAt  = new Date(day);
        createdAt.setHours(rand(8, 20), rand(0, 59), rand(0, 59));
        const receivedAt = new Date(createdAt.getTime() + rand(30, 120) * 60000);
        const deliveredAt = status === 'delivered'
          ? new Date(receivedAt.getTime() + rand(2, 8) * 3600000)
          : null;

        // sl_parcels
        parcelRows.push([
          parcelId, shopId, areaId, status,
          charge, codCharge, returnCharge,
          partner?.id ?? null, trackId, areaId,
          weight, cashValue,
          createdAt, createdAt,
        ]);

        // sl_logistics_parcel_routes — delivery serial only
        routeRows.push([routeId++, parcelId, hid, 'delivery', 4, createdAt, createdAt]);

        // sl_parcel_logs — received-from-seller (SLA start)
        logRows.push([logId++, parcelId, 'received-from-seller', 'ready-for-delivery',
                      hid, receivedAt, receivedAt]);

        // sl_parcel_logs — delivery / return event
        if (status === 'delivered' && deliveredAt) {
          logRows.push([logId++, parcelId,
            partner ? 'fourpl-status-update' : 'user-delivered',
            'delivered', hid, deliveredAt, deliveredAt]);
        } else if (status === 'shopup-returned') {
          const retAt = new Date(receivedAt.getTime() + rand(1, 3) * 86400000);
          logRows.push([logId++, parcelId, 'received-problematic-parcel',
            'shopup-returning', hid, retAt, retAt]);
        }

        // sl_fourpl_parcels (only for delivered 4PL parcels)
        if (partner && status === 'delivered') {
          fourplRows.push([
            fourplId++, partner.name, trackId, 'delivered', hid,
            fourplCharge, createdAt, createdAt,
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

    // Collect active areas per hub (up to 20 for SLA variation)
    const hubAreas = new Map<number, number[]>();
    for (const hubId of Object.keys(FOCUS_HUBS).map(Number)) {
      const [rows] = await conn.query<any[]>(
        `SELECT AREA_ID FROM sl_area_hub WHERE HUB_ID=? AND STATUS='active' LIMIT 20`,
        [hubId]
      );
      hubAreas.set(hubId, rows.map((r: any) => r.AREA_ID));
    }

    await seedShopZones(conn);
    await seedFourplPartnerPricing(conn);
    await activatePartners(conn);
    await seedHubCosts(conn);
    await seedAreaPartners(conn, hubAreas);
    await seedDmDailyVolume(conn);
    await seedDmContributionMargin(conn);
    await seedDmPartnerSla(conn, hubAreas);
    await cleanDemoParcels(conn);
    await seedParcels(conn, hubAreas);

    console.log('\nDemo seed complete.');
    console.log('Tip: run "npm run db:aggregate" to recalculate dm_hub_contribution_margin from actual parcel data.');
  } finally {
    await conn.query(`SET foreign_key_checks = 1`);
    await conn.end();
  }
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
