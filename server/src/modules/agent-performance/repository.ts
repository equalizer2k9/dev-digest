import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { COUNTED_STATUSES } from './constants.js';
import type { PerfRunRow } from './helpers.js';

/**
 * Agent-performance data access. Read-only over `agent_runs`, `reviews` and
 * `findings`; every query is workspace-scoped.
 *
 * `reviews.run_id` has no foreign key, so reviews and findings are LEFT joined and
 * counted with `count(findings.id)` — a run without findings counts 0, and a
 * review with no run link is never attributed to any run.
 */
export class AgentPerformanceRepository {
  constructor(private db: Db) {}

  /** One row per run of the workspace with status done/failed in `[from, to)`. */
  async runsInPeriod(workspaceId: string, p: { from: Date; to: Date }): Promise<PerfRunRow[]> {
    const f = t.findings;
    const count = (cond: ReturnType<typeof sql>) =>
      sql<number>`count(${f.id}) filter (where ${cond})`.mapWith(Number);

    return this.db
      .select({
        id: t.agentRuns.id,
        workspaceId: t.agentRuns.workspaceId,
        agentId: t.agentRuns.agentId,
        status: t.agentRuns.status,
        source: t.agentRuns.source,
        ranAt: t.agentRuns.ranAt,
        model: t.agentRuns.model,
        durationMs: t.agentRuns.durationMs,
        costUsd: t.agentRuns.costUsd,
        accepted: count(sql`${f.acceptedAt} is not null`),
        dismissed: count(sql`${f.dismissedAt} is not null`),
        pending: count(sql`${f.acceptedAt} is null and ${f.dismissedAt} is null`),
        critical: count(sql`${f.severity} = 'CRITICAL'`),
        warning: count(sql`${f.severity} = 'WARNING'`),
        suggestion: count(sql`${f.severity} = 'SUGGESTION'`),
      })
      .from(t.agentRuns)
      .leftJoin(
        t.reviews,
        and(eq(t.reviews.runId, t.agentRuns.id), eq(t.reviews.workspaceId, workspaceId)),
      )
      .leftJoin(f, eq(f.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.status, [...COUNTED_STATUSES]),
          gte(t.agentRuns.ranAt, p.from),
          lt(t.agentRuns.ranAt, p.to),
        ),
      )
      .groupBy(t.agentRuns.id);
  }
}
