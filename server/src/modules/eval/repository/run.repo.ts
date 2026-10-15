import { and, eq } from 'drizzle-orm';
import type { EvalCaseResult, EvalMetric, EvalRunSkill } from '@devdigest/shared';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import { PG_UNIQUE_VIOLATION, RUN_INTERRUPTED } from '../constants.js';

export type EvalRunDbRow = typeof t.evalRuns.$inferSelect;

export interface NewRunningRun {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
  provider: string;
  model: string;
  skills: EvalRunSkill[];
}

export interface FinishedRunValues {
  results: EvalCaseResult[];
  recall: EvalMetric;
  precision: EvalMetric;
  citationAccuracy: EvalMetric;
  passed: number;
  total: number;
  hasErrors: boolean;
  costUsd: number | null;
  durationMs: number;
}

/** postgres.js surfaces the SQLSTATE as `err.code`; keep a `cause` fallback for wrapped errors. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === PG_UNIQUE_VIOLATION || e?.cause?.code === PG_UNIQUE_VIOLATION;
}

/** Insert a `running` run. Null when the agent already has one (partial unique index). */
export async function insertRunning(db: Db, values: NewRunningRun): Promise<EvalRunDbRow | null> {
  try {
    const [row] = await db
      .insert(t.evalRuns)
      .values({ ...values, status: 'running' })
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

/**
 * Store a finished run in one UPDATE. False when no running row matched — the agent
 * (and with it the run) was deleted meanwhile, or the run was already reaped.
 */
export async function finishRun(db: Db, runId: string, v: FinishedRunValues): Promise<boolean> {
  const rows = await db
    .update(t.evalRuns)
    .set({
      status: 'completed',
      results: v.results,
      recall: v.recall,
      precision: v.precision,
      citationAccuracy: v.citationAccuracy,
      passed: v.passed,
      total: v.total,
      hasErrors: v.hasErrors,
      costUsd: v.costUsd,
      durationMs: v.durationMs,
      finishedAt: new Date(),
    })
    .where(and(eq(t.evalRuns.id, runId), eq(t.evalRuns.status, 'running')))
    .returning({ id: t.evalRuns.id });
  return rows.length > 0;
}

export async function failRun(db: Db, runId: string, reason: string): Promise<boolean> {
  const rows = await db
    .update(t.evalRuns)
    .set({ status: 'failed', error: reason, finishedAt: new Date() })
    .where(and(eq(t.evalRuns.id, runId), eq(t.evalRuns.status, 'running')))
    .returning({ id: t.evalRuns.id });
  return rows.length > 0;
}

/** On boot: a run still `running` belongs to a dead process. */
export async function reapInterrupted(db: Db): Promise<number> {
  const rows = await db
    .update(t.evalRuns)
    .set({ status: 'failed', error: RUN_INTERRUPTED, finishedAt: new Date() })
    .where(eq(t.evalRuns.status, 'running'))
    .returning({ id: t.evalRuns.id });
  return rows.length;
}
