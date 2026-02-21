/**
 * metabase.pipeline.ts — Question registry and pipeline runner
 * Fetches each registered Metabase question and returns the results.
 */

import { MetabaseClient, MetabaseRow } from './metabase.client';
import { logger } from '@common/utils/logger.util';

// ─────────────────────────────────────────────────────────────────
// Question Registry
// Maps a human-readable label → Metabase card ID
// Add entries here as you register more questions.
// ─────────────────────────────────────────────────────────────────

export const QUESTIONS = {
  sla:  236824,   // 4PL Active Parcels V2
  cost: 236825,
} as const;

export type QuestionLabel = keyof typeof QUESTIONS;

export type PipelineResult = Record<string, MetabaseRow[]>;

// ─────────────────────────────────────────────────────────────────
// Pipeline
// ─────────────────────────────────────────────────────────────────

/**
 * Fetch all registered questions and return their rows.
 *
 * @param questions  Optional override — defaults to QUESTIONS registry above.
 * @returns  Record mapping each label to its array of row objects.
 */
export async function runPipeline(
  questions: Record<string, number> = QUESTIONS,
): Promise<PipelineResult> {
  const client = new MetabaseClient();
  await client.ensureAuthenticated();

  const results: PipelineResult = {};

  for (const [label, cardId] of Object.entries(questions)) {
    logger.info(`Metabase pipeline: fetching "${label}" (card ${cardId})`);
    try {
      results[label] = await client.runCardJson(cardId);
    } catch (err) {
      logger.error(`Metabase pipeline: failed to fetch "${label}"`, {
        message: (err as Error).message,
      });
      results[label] = [];
    }
  }

  logger.info('Metabase pipeline: complete', {
    summary: Object.fromEntries(
      Object.entries(results).map(([k, v]) => [k, v.length]),
    ),
  });

  return results;
}

/**
 * Convenience: fetch a single question by card ID.
 */
export async function fetchQuestion(cardId: number): Promise<MetabaseRow[]> {
  const client = new MetabaseClient();
  await client.ensureAuthenticated();
  return client.runCardJson(cardId);
}
