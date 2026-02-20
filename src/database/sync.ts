/**
 * Data Sync Script
 * Copies required tables from stage1_shopuplite (STAGE_DB_*) into the local
 * dispatch_mind_ai Docker DB (DB_*).
 *
 * Usage: npm run db:sync
 *
 * Strategy:
 *  - Reference/small tables  → full copy
 *  - Large tables (parcels)  → last 90 days only
 *  - Child tables            → only rows whose PARCEL_ID exists in copied parcels
 */

import mysql from 'mysql2/promise';
import 'dotenv/config';

// ─── Connections ──────────────────────────────────────────────────────────────

async function createSourceConnection(): Promise<mysql.Connection> {
  return mysql.createConnection({
    host: process.env.STAGE_DB_HOST,
    port: Number(process.env.STAGE_DB_PORT ?? 3306),
    user: process.env.STAGE_DB_USER,
    password: process.env.STAGE_DB_PASSWORD,
    database: process.env.STAGE_DB_NAME ?? 'stage1_shopuplite',
    multipleStatements: true,
  });
}

async function createTargetConnection(): Promise<mysql.Connection> {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 3307),
    user: process.env.DB_USER ?? 'dispatch',
    password: process.env.DB_PASSWORD ?? 'dispatch123',
    database: process.env.DB_NAME ?? 'dispatch_mind_ai',
    multipleStatements: true,
  });
  // Disable strict mode so null values in NOT NULL columns are stored as defaults
  await conn.query(`SET SESSION sql_mode = 'NO_ENGINE_SUBSTITUTION'`);
  return conn;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getCreateTableSQL(conn: mysql.Connection, table: string): Promise<string> {
  const [rows] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
  let sql = (rows as any[])[0]['Create Table'] as string;
  // Remove AUTO_INCREMENT counter so fresh inserts don't conflict
  sql = sql.replace(/\s*AUTO_INCREMENT=\d+/gi, '');
  // Replace JSON columns with LONGTEXT to avoid strict JSON validation on dirty source data
  sql = sql.replace(/\bjson\b/gi, 'LONGTEXT');
  return sql;
}

async function recreateTable(
  source: mysql.Connection,
  target: mysql.Connection,
  table: string
): Promise<void> {
  const createSQL = await getCreateTableSQL(source, table);
  await target.query(`DROP TABLE IF EXISTS \`${table}\``);
  await target.query(createSQL);
  console.log(`  ✓ Created table: ${table}`);
}

const BATCH_SIZE = 500;

async function copyRows(
  source: mysql.Connection,
  target: mysql.Connection,
  table: string,
  whereClause = ''
): Promise<number> {
  let offset = 0;
  let total = 0;
  const where = whereClause ? `WHERE ${whereClause}` : '';

  while (true) {
    const [rows] = await source.query(
      `SELECT * FROM \`${table}\` ${where} LIMIT ${BATCH_SIZE} OFFSET ${offset}`
    );
    const batch = rows as Record<string, unknown>[];
    if (batch.length === 0) break;

    const columns = Object.keys(batch[0]);
    const placeholders = batch
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ');
    const values = batch.flatMap(row => columns.map(col => row[col] ?? null));

    await target.query(
      `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES ${placeholders}`,
      values
    );

    total += batch.length;
    offset += BATCH_SIZE;
    if (batch.length < BATCH_SIZE) break;
  }

  return total;
}

// ─── Table Definitions ────────────────────────────────────────────────────────

// Full copy — small reference tables
const FULL_COPY_TABLES = [
  'sl_hubs',
  'sl_delivery_partners',
  'sl_zones',
  'sl_areas',
  'sl_area_partners',
  'sl_area_hub',
  'sl_hub_configs',
];

// Partial copy — last 90 days
const RECENT_TABLES: { table: string; dateCol: string }[] = [
  { table: 'sl_parcels', dateCol: 'created_at' },
];

// Child tables — filtered by parcel IDs copied above
const PARCEL_CHILD_TABLES = [
  'sl_logistics_parcel_routes',
  'sl_parcel_logs',
];

// 4PL tables — no direct PARCEL_ID FK; copy by their own date column
const FOURPL_RECENT_TABLES: { table: string; dateCol: string }[] = [
  { table: 'sl_fourpl_parcels', dateCol: 'created_at' },
  { table: 'sl_fourpl_payments', dateCol: 'created_at' },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function sync() {
  console.log('🔄  Starting data sync from stage1_shopuplite → dispatch_mind_ai\n');

  const source = await createSourceConnection();
  const target = await createTargetConnection();

  try {
    // Disable FK checks on target for clean recreation
    await target.query('SET FOREIGN_KEY_CHECKS = 0');

    // 1. Full copy — reference tables
    console.log('📋  Copying reference tables (full)...');
    for (const table of FULL_COPY_TABLES) {
      try {
        await recreateTable(source, target, table);
        const count = await copyRows(source, target, table);
        console.log(`     → ${count} rows copied`);
      } catch (err: any) {
        console.warn(`  ⚠ Skipped ${table}: ${err.message}`);
      }
    }

    // 2. Recent parcels — last 90 days
    console.log('\n📦  Copying recent parcel data (last 90 days)...');
    for (const { table, dateCol } of RECENT_TABLES) {
      try {
        await recreateTable(source, target, table);
        const where = `\`${dateCol}\` >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;
        const count = await copyRows(source, target, table, where);
        console.log(`     → ${count} rows copied from ${table}`);
      } catch (err: any) {
        console.warn(`  ⚠ Skipped ${table}: ${err.message}`);
      }
    }

    // 3. Child tables filtered by copied parcel IDs
    console.log('\n🔗  Copying parcel child tables (filtered by copied parcel IDs)...');
    const [parcelRows] = await target.query('SELECT ID FROM sl_parcels');
    const parcelIds = (parcelRows as { ID: number }[]).map(r => r.ID);

    if (parcelIds.length > 0) {
      for (const table of PARCEL_CHILD_TABLES) {
        try {
          await recreateTable(source, target, table);

          // Copy in chunks to avoid huge IN clauses
          const chunkSize = 1000;
          let total = 0;
          for (let i = 0; i < parcelIds.length; i += chunkSize) {
            const chunk = parcelIds.slice(i, i + chunkSize);
            const [rows] = await source.query(
              `SELECT * FROM \`${table}\` WHERE PARCEL_ID IN (${chunk.map(() => '?').join(',')})`,
              chunk
            );
            const batch = rows as Record<string, unknown>[];
            if (batch.length === 0) continue;

            const columns = Object.keys(batch[0]);
            const placeholders = batch
              .map(() => `(${columns.map(() => '?').join(', ')})`)
              .join(', ');
            const values = batch.flatMap(row => columns.map(col => row[col] ?? null));

            await target.query(
              `INSERT INTO \`${table}\` (\`${columns.join('`, `')}\`) VALUES ${placeholders}`,
              values
            );
            total += batch.length;
          }
          console.log(`  ✓ ${table} → ${total} rows copied`);
        } catch (err: any) {
          console.warn(`  ⚠ Skipped ${table}: ${err.message}`);
        }
      }
    } else {
      console.log('  ⚠ No parcels found — skipping child tables');
    }

    // 4. 4PL tables — copy by their own date column
    console.log('\n🤝  Copying 4PL tables (last 90 days)...');
    for (const { table, dateCol } of FOURPL_RECENT_TABLES) {
      try {
        await recreateTable(source, target, table);
        const where = `\`${dateCol}\` >= DATE_SUB(NOW(), INTERVAL 90 DAY)`;
        const count = await copyRows(source, target, table, where);
        console.log(`  ✓ ${table} → ${count} rows copied`);
      } catch (err: any) {
        console.warn(`  ⚠ Skipped ${table}: ${err.message}`);
      }
    }

    await target.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('\n✅  Sync complete!');
    console.log('💡  Next: seed dm_hub_monthly_costs via POST /api/v1/hubs/:hubId/costs');
  } finally {
    await source.end();
    await target.end();
  }
}

sync().catch(err => {
  console.error('❌  Sync failed:', err.message);
  process.exit(1);
});
