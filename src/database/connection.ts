import mysql from 'mysql2/promise';
import { databaseConfig } from '../config/database.config';
import { logger } from '../common/utils/logger.util';

const pool = mysql.createPool(databaseConfig);

export async function testDatabaseConnection(): Promise<void> {
  const connection = await pool.getConnection();
  await connection.ping();
  connection.release();
  logger.info('Database connection established successfully');
}

export function getPool(): mysql.Pool {
  return pool;
}

export async function query<T>(sql: string, params: (string | number | boolean | null)[] = []): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}
