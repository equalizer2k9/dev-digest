/**
 * AgentPerformanceRepository.runsInPeriod on real Postgres: statuses, [from, to)
 * bounds, workspace scoping, a run without agent, decision counts joined through
 * reviews.run_id, and a CI run with no findings. Gated on Docker.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { AgentPerformanceRepository } from '../src/modules/agent-performance/repository.js';
import { aggregatePerformance } from '../src/modules/agent-performance/helpers.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FROM = new Date('2026-10-01T00:00:00Z');
const TO = new Date('2026-10-11T00:00:00Z');
const MID = new Date('2026-10-05T00:00:00Z');

d('AgentPerformanceRepository (Testcontainers pg)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('runsInPeriod returns exactly the counted runs of the workspace with decision counts joined through reviews.run_id', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [ws2] = await db.insert(t.workspaces).values({ name: 'Other' }).returning();

    const mkAgent = async (wsId: string, name: string) => {
      const [a] = await db
        .insert(t.agents)
        .values({ workspaceId: wsId, name, provider: 'openai', model: 'gpt', systemPrompt: 'p' })
        .returning();
      return a!;
    };
    const agentA = await mkAgent(workspaceId, 'perf-A');
    const agentB = await mkAgent(workspaceId, 'perf-B');
    const agentW2 = await mkAgent(ws2!.id, 'perf-W2');

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'perf', fullName: 'acme/perf' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Perf',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc',
      })
      .returning();

    const mkRun = async (
      over: Partial<typeof t.agentRuns.$inferInsert> & { agentId: string | null },
    ) => {
      const [r] = await db
        .insert(t.agentRuns)
        .values({
          workspaceId,
          ranAt: MID,
          status: 'done',
          model: 'gpt',
          durationMs: 1000,
          costUsd: 0.1,
          ...over,
        })
        .returning();
      return r!;
    };

    // Statuses (AC-2)
    const aDone = await mkRun({ agentId: agentA.id, costUsd: 0.1, durationMs: 1000 });
    const aFailed = await mkRun({ agentId: agentA.id, status: 'failed', costUsd: null, durationMs: null });
    await mkRun({ agentId: agentA.id, status: 'running' });
    await mkRun({ agentId: agentA.id, status: 'cancelled' });
    // Bounds (AC-2)
    const atFrom = await mkRun({ agentId: agentB.id, ranAt: FROM, costUsd: 0.2 });
    await mkRun({ agentId: agentB.id, ranAt: TO });
    await mkRun({ agentId: agentB.id, ranAt: new Date(FROM.getTime() - 1) });
    // Foreign workspace (AC-2, NFR-11)
    await db.insert(t.agentRuns).values({
      workspaceId: ws2!.id,
      agentId: agentW2.id,
      ranAt: MID,
      status: 'done',
      costUsd: 9,
    });
    // Deleted agent (AC-8)
    const orphan = await mkRun({ agentId: null, costUsd: 0.3 });
    // CI run with no review (AC-5, EC-1)
    const ci = await mkRun({ agentId: agentB.id, source: 'ci', costUsd: 0.4, durationMs: 2500 });

    // Decisions through reviews.run_id (AC-5)
    const [linked] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: agentA.id, runId: aDone.id, kind: 'review' })
      .returning();
    const f = (severity: string, i: number, extra: Partial<typeof t.findings.$inferInsert> = {}) => ({
      reviewId: linked!.id,
      file: 'a.ts',
      startLine: i,
      endLine: i,
      severity,
      category: 'bug',
      title: 't',
      rationale: 'r',
      confidence: 0.9,
      ...extra,
    });
    await db.insert(t.findings).values([
      f('CRITICAL', 1, { acceptedAt: MID }),
      f('WARNING', 2, { acceptedAt: MID }),
      f('WARNING', 3, { dismissedAt: MID }),
      f('SUGGESTION', 4),
    ]);
    // Same PR, review not linked to any run: must add nothing.
    const [unlinked] = await db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: agentA.id, runId: null, kind: 'review' })
      .returning();
    await db.insert(t.findings).values(
      [1, 2, 3].map((i) => f('CRITICAL', 10 + i, { reviewId: unlinked!.id, acceptedAt: MID })),
    );

    const repository = new AgentPerformanceRepository(db);
    const rows = await repository.runsInPeriod(workspaceId, { from: FROM, to: TO });

    expect(rows.map((r) => r.id).sort()).toEqual(
      [aDone.id, aFailed.id, atFrom.id, orphan.id, ci.id].sort(),
    );
    const byId = new Map(rows.map((r) => [r.id, r]));

    const done = byId.get(aDone.id)!;
    expect(done).toMatchObject({
      accepted: 2,
      dismissed: 1,
      pending: 1,
      critical: 1,
      warning: 2,
      suggestion: 1,
    });
    for (const k of ['accepted', 'dismissed', 'pending', 'critical', 'warning', 'suggestion'] as const) {
      expect(typeof done[k]).toBe('number');
    }
    expect(byId.get(aFailed.id)).toMatchObject({ status: 'failed', accepted: 0, costUsd: null });
    expect(byId.get(orphan.id)!.agentId).toBeNull();
    expect(byId.get(ci.id)).toMatchObject({
      source: 'ci',
      accepted: 0,
      dismissed: 0,
      pending: 0,
      costUsd: 0.4,
      durationMs: 2500,
    });

    // End-to-end sum (AC-8)
    const perf = aggregatePerformance({
      workspaceId,
      period: { preset: 'custom', from: FROM, to: TO },
      runs: rows,
      agents: [
        { id: agentA.id, name: agentA.name },
        { id: agentB.id, name: agentB.name },
      ],
    });
    expect(perf.totals.runs).toBe(5);
    expect(perf.totals.runs).toBe(perf.rows.reduce((s, r) => s + r.runs, 0));
    expect(perf.totals.total_cost_usd).toBeCloseTo(0.1 + 0.2 + 0.3 + 0.4, 9);
  });
});
