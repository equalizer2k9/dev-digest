import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
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
  /** Cases the run evaluates, known at the start (the status line shows it). */
  total: number;
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

/** A run row with its agent's name (left join: null only if the agent row is gone). */
export interface EvalRunWithAgent {
  run: EvalRunDbRow;
  agentName: string | null;
}

export interface DashboardAgentRow {
  agentId: string;
  name: string;
  enabled: boolean;
  casesTotal: number;
  latest: EvalRunWithAgent | null;
}

/** An agent's runs, newest first. */
export function listRuns(db: Db, workspaceId: string, agentId: string): Promise<EvalRunDbRow[]> {
  return db
    .select()
    .from(t.evalRuns)
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), eq(t.evalRuns.agentId, agentId)))
    .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
}

export async function runsByIds(db: Db, workspaceId: string, ids: string[]): Promise<EvalRunWithAgent[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ run: t.evalRuns, agentName: t.agents.name })
    .from(t.evalRuns)
    .leftJoin(t.agents, eq(t.evalRuns.agentId, t.agents.id))
    .where(and(eq(t.evalRuns.workspaceId, workspaceId), inArray(t.evalRuns.id, ids)));
  return rows;
}

/** The newest runs of the workspace across agents, newest first. */
export function recentRuns(db: Db, workspaceId: string, limit: number): Promise<EvalRunWithAgent[]> {
  return db
    .select({ run: t.evalRuns, agentName: t.agents.name })
    .from(t.evalRuns)
    .leftJoin(t.agents, eq(t.evalRuns.agentId, t.agents.id))
    .where(eq(t.evalRuns.workspaceId, workspaceId))
    .orderBy(desc(t.evalRuns.ranAt), desc(t.evalRuns.id))
    .limit(limit);
}

/**
 * One row per agent of the workspace that has at least one eval case (enabled or not),
 * with its case count and its latest completed run. Reads `eval_cases` and `eval_runs`
 * only, plus the agent's name and flag.
 */
export async function dashboardRows(db: Db, workspaceId: string): Promise<DashboardAgentRow[]> {
  const agents = await db
    .select({
      agentId: t.agents.id,
      name: t.agents.name,
      enabled: t.agents.enabled,
      casesTotal: count(t.evalCases.id),
    })
    .from(t.evalCases)
    .innerJoin(t.agents, eq(t.evalCases.agentId, t.agents.id))
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
    .groupBy(t.agents.id, t.agents.name, t.agents.enabled)
    .orderBy(asc(t.agents.name), asc(t.agents.id));
  if (agents.length === 0) return [];

  const latestRows = await db
    .selectDistinctOn([t.evalRuns.agentId])
    .from(t.evalRuns)
    .where(
      and(
        eq(t.evalRuns.workspaceId, workspaceId),
        eq(t.evalRuns.status, 'completed'),
        inArray(
          t.evalRuns.agentId,
          agents.map((a) => a.agentId),
        ),
      ),
    )
    .orderBy(t.evalRuns.agentId, desc(t.evalRuns.ranAt), desc(t.evalRuns.id));
  const latestByAgent = new Map(latestRows.map((r) => [r.agentId, r]));

  return agents.map((a) => {
    const run = latestByAgent.get(a.agentId);
    return { ...a, latest: run ? { run, agentName: a.name } : null };
  });
}
