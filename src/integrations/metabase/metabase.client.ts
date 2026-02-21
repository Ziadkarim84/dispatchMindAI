/**
 * metabase.client.ts — Metabase API client
 * Supports session token auth (from browser) with username/password fallback.
 */

import { env } from '@config/env.validation';
import { logger } from '@common/utils/logger.util';

const BASE_URL = 'https://plmb.shopup.center';

const DEFAULT_QUERY_BODY = {
  parameters: [],
  format_rows: true,
  pivot_results: false,
};

export interface MetabaseRow {
  [column: string]: unknown;
}

export interface NativeQueryResult {
  columns: string[];
  rows: MetabaseRow[];
}

export class MetabaseClient {
  private readonly baseUrl: string;
  private sessionToken: string;

  constructor() {
    this.baseUrl = BASE_URL;
    this.sessionToken = env.METABASE_SESSION_TOKEN ?? '';
  }

  private headers(): Record<string, string> {
    return {
      'X-Metabase-Session': this.sessionToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Metabase GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown, asForm = false): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: asForm
        ? { 'X-Metabase-Session': this.sessionToken }
        : this.headers(),
      body: asForm
        ? new URLSearchParams(body as Record<string, string>)
        : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Metabase POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  // ─────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────

  /** Login with username/password and refresh session token. */
  async authenticate(): Promise<string> {
    const user = env.METABASE_USER;
    const pass = env.METABASE_PASS;
    if (!user || !pass) {
      throw new Error('Set METABASE_USER and METABASE_PASS in .env for re-authentication.');
    }
    const data = await this.post<{ id: string }>('/api/session', {
      username: user,
      password: pass,
    });
    this.sessionToken = data.id;
    logger.info('Metabase: authenticated via username/password');
    return this.sessionToken;
  }

  /** Check if the current session token is still valid. */
  async checkSession(): Promise<boolean> {
    try {
      const user = await this.get<{ email?: string }>('/api/user/current');
      logger.info(`Metabase: session valid — logged in as ${user.email ?? 'unknown'}`);
      return true;
    } catch {
      logger.warn('Metabase: session expired or invalid');
      return false;
    }
  }

  /** Check session; re-authenticate with credentials if expired. */
  async ensureAuthenticated(): Promise<void> {
    const valid = await this.checkSession();
    if (!valid) {
      logger.info('Metabase: attempting re-authentication...');
      await this.authenticate();
    }
  }

  async logout(): Promise<void> {
    await fetch(`${this.baseUrl}/api/session`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    logger.info('Metabase: logged out');
  }

  // ─────────────────────────────────────────────
  // Core Query Runner
  // ─────────────────────────────────────────────

  /**
   * Execute a saved question and return results as an array of row objects.
   * Retries once if the session has expired (401).
   */
  async runCardJson(cardId: number, parameters: unknown[] = []): Promise<MetabaseRow[]> {
    const body = { ...DEFAULT_QUERY_BODY, parameters };
    const path = `/api/card/${cardId}/query/json`;

    let res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      logger.warn('Metabase: 401 on runCardJson — re-authenticating...');
      await this.authenticate();
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) throw new Error(`Metabase card ${cardId} query failed: ${res.status}`);
    const data = (await res.json()) as MetabaseRow[];
    logger.info(`Metabase: card ${cardId} returned ${data.length} rows`);
    return data;
  }

  /** Execute a saved question and return raw CSV string. */
  async runCardCsv(cardId: number, parameters: unknown[] = []): Promise<string> {
    const path = `/api/card/${cardId}/query/csv`;
    const formBody = new URLSearchParams({
      parameters: JSON.stringify(parameters),
      format_rows: String(DEFAULT_QUERY_BODY.format_rows),
      pivot_results: String(DEFAULT_QUERY_BODY.pivot_results),
    });

    let res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'X-Metabase-Session': this.sessionToken },
      body: formBody,
    });

    if (res.status === 401) {
      await this.authenticate();
      res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'X-Metabase-Session': this.sessionToken },
        body: formBody,
      });
    }

    if (!res.ok) throw new Error(`Metabase card ${cardId} CSV query failed: ${res.status}`);
    return res.text();
  }

  // ─────────────────────────────────────────────
  // Discovery
  // ─────────────────────────────────────────────

  listQuestions(): Promise<MetabaseRow[]> {
    return this.get<MetabaseRow[]>('/api/card');
  }

  listDashboards(): Promise<MetabaseRow[]> {
    return this.get<MetabaseRow[]>('/api/dashboard');
  }

  async listDatabases(): Promise<MetabaseRow[]> {
    const res = await this.get<{ data: MetabaseRow[] }>('/api/database');
    return res.data;
  }

  /** Run a raw SQL query against a connected database. */
  async runNativeQuery(databaseId: number, sql: string): Promise<NativeQueryResult> {
    const res = await this.post<{
      data: { cols: { name: string }[]; rows: unknown[][] };
    }>('/api/dataset', {
      database: databaseId,
      type: 'native',
      native: { query: sql },
    });

    const columns = res.data.cols.map((c) => c.name);
    const rows = res.data.rows.map((row) =>
      Object.fromEntries(columns.map((col, i) => [col, row[i]])),
    );
    return { columns, rows };
  }
}
