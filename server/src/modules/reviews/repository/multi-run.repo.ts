import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { AgentRunRow, FindingRow } from '../../../db/rows.js';


/** A linked agent run with its agent's name (null when the agent was deleted). */
export interface MultiRunAgentRun {
  run: AgentRunRow;
  agentName: string | null;
}

export interface MultiRunHead {
  id: string;
  ranAt: Date;
  pr: { id: string; number: number; title: string; repoId: string };
}

export async function createMultiRun(
  db: Db,
  values: { workspaceId: string; prId: string },
): Promise<{ id: string; ranAt: Date }> {
  const [row] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId: values.workspaceId, prId: values.prId })
    .returning({ id: t.multiAgentRuns.id, ranAt: t.multiAgentRuns.ranAt });
  return row!;
}

/** One multi run + its pull; scoped on the multi run's own workspace_id. */
export async function getMultiRun(
  db: Db,
  workspaceId: string,
  id: string,
): Promise<MultiRunHead | undefined> {
  const [row] = await db
    .select({
      id: t.multiAgentRuns.id,
      ranAt: t.multiAgentRuns.ranAt,
      prId: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      repoId: t.pullRequests.repoId,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
  if (!row) return undefined;
  return {
    id: row.id,
    ranAt: row.ranAt,
    pr: { id: row.prId, number: row.number, title: row.title, repoId: row.repoId },
  };
}

/** Linked agent runs in launch order (ran_at asc, id asc). */
export async function agentRunsForMultiRun(db: Db, multiRunId: string): Promise<MultiRunAgentRun[]> {
  const rows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(eq(t.agentRuns.multiAgentRunId, multiRunId))
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  return rows.map((r) => ({ run: r.run, agentName: r.agentName ?? null }));
}

/**
 * For each run, its newest `kind='review'` review with that review's findings
 * (ordered file, start_line, id) and created_at. Runs without a review are absent.
 * `reviews.run_id` has no FK, so any join through it stays a LEFT join.
 */
export async function reviewsWithFindingsForRuns(
  db: Db,
  runIds: string[],
): Promise<{ runId: string; createdAt: Date; findings: FindingRow[] }[]> {
  if (runIds.length === 0) return [];
  const reviewRows = await db
    .select()
    .from(t.reviews)
    .where(and(inArray(t.reviews.runId, runIds), eq(t.reviews.kind, 'review')))
    .orderBy(desc(t.reviews.createdAt), desc(t.reviews.id));
  const newest = new Map<string, (typeof reviewRows)[number]>();
  for (const r of reviewRows) {
    if (r.runId && !newest.has(r.runId)) newest.set(r.runId, r);
  }
  if (newest.size === 0) return [];
  const reviewIds = [...newest.values()].map((r) => r.id);
  const findingRows = await db
    .select()
    .from(t.findings)
    .where(inArray(t.findings.reviewId, reviewIds))
    .orderBy(asc(t.findings.file), asc(t.findings.startLine), asc(t.findings.id));
  return [...newest.entries()].map(([runId, review]) => ({
    runId,
    createdAt: review.createdAt,
    findings: findingRows.filter((f) => f.reviewId === review.id),
  }));
}

export interface MultiRunListRow extends MultiRunHead {
  runs: (MultiRunAgentRun & { reviewCreatedAt: Date | null })[];
}

/** Newest first, optionally narrowed to one PR; each with its agent runs. */
export async function listMultiRuns(
  db: Db,
  workspaceId: string,
  opts: { prId?: string | undefined; limit: number },
): Promise<MultiRunListRow[]> {
  const where = opts.prId
    ? and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, opts.prId))
    : eq(t.multiAgentRuns.workspaceId, workspaceId);
  const heads = await db
    .select({
      id: t.multiAgentRuns.id,
      ranAt: t.multiAgentRuns.ranAt,
      prId: t.pullRequests.id,
      number: t.pullRequests.number,
      title: t.pullRequests.title,
      repoId: t.pullRequests.repoId,
    })
    .from(t.multiAgentRuns)
    .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.multiAgentRuns.prId))
    .where(where)
    .orderBy(desc(t.multiAgentRuns.ranAt), desc(t.multiAgentRuns.id))
    .limit(opts.limit);
  if (heads.length === 0) return [];

  const runRows = await db
    .select({ run: t.agentRuns, agentName: t.agents.name })
    .from(t.agentRuns)
    .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
    .where(
      inArray(
        t.agentRuns.multiAgentRunId,
        heads.map((h) => h.id),
      ),
    )
    .orderBy(asc(t.agentRuns.ranAt), asc(t.agentRuns.id));
  const reviewRows = runRows.length
    ? await db
        .select({ runId: t.reviews.runId, createdAt: t.reviews.createdAt })
        .from(t.reviews)
        .where(
          and(
            inArray(
              t.reviews.runId,
              runRows.map((r) => r.run.id),
            ),
            eq(t.reviews.kind, 'review'),
          ),
        )
    : [];
  const reviewAt = new Map<string, Date>();
  for (const r of reviewRows) {
    if (!r.runId) continue;
    const prev = reviewAt.get(r.runId);
    if (!prev || r.createdAt > prev) reviewAt.set(r.runId, r.createdAt);
  }

  return heads.map((h) => ({
    id: h.id,
    ranAt: h.ranAt,
    pr: { id: h.prId, number: h.number, title: h.title, repoId: h.repoId },
    runs: runRows
      .filter((r) => r.run.multiAgentRunId === h.id)
      .map((r) => ({
        run: r.run,
        agentName: r.agentName ?? null,
        reviewCreatedAt: reviewAt.get(r.run.id) ?? null,
      })),
  }));
}

/** An agent's latest finished local runs, newest first (estimate input). */
export async function finishedLocalRuns(
  db: Db,
  workspaceId: string,
  agentId: string,
  limit: number,
): Promise<{ durationMs: number | null; costUsd: number | null }[]> {
  return db
    .select({ durationMs: t.agentRuns.durationMs, costUsd: t.agentRuns.costUsd })
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.workspaceId, workspaceId),
        eq(t.agentRuns.agentId, agentId),
        eq(t.agentRuns.status, 'done'),
        eq(t.agentRuns.source, 'local'),
      ),
    )
    .orderBy(desc(t.agentRuns.ranAt), desc(t.agentRuns.id))
    .limit(limit);
}
