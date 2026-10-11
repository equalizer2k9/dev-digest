/**
 * GET /repos/:id/pulls — `findings_counts` tallies only each AGENT's latest
 * review. With two agents and two reviews by one of them, the older review's
 * findings must not count while the other agent's review still does.
 * Gated on Docker (real Postgres), like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('PR list findings_counts (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openai: new MockLLMProvider('openai') }, embedder: new MockEmbedder() },
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function addReview(
    prId: string,
    agentId: string,
    createdAt: Date,
    severities: string[],
  ) {
    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, createdAt })
      .returning();
    await pg.handle.db.insert(t.findings).values(
      severities.map((severity, i) => ({
        reviewId: review!.id,
        file: 'src/a.ts',
        startLine: i + 1,
        endLine: i + 1,
        severity,
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.9,
      })),
    );
  }

  it('counts only each agent latest review, across two agents', async () => {
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'counts', fullName: 'acme/counts' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Counts',
        author: 'a',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc',
        additions: 0,
        deletions: 0,
        filesCount: 0,
        status: 'open',
      })
      .returning();
    const agentA = randomUUID();
    const agentB = randomUUID();
    const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));

    // Agent A: an older review (3 CRITICAL) superseded by a newer one (1 WARNING).
    await addReview(pr!.id, agentA, at(1), ['CRITICAL', 'CRITICAL', 'CRITICAL']);
    await addReview(pr!.id, agentA, at(3), ['WARNING']);
    // Agent B: one review, older than A's newest — still its own latest.
    await addReview(pr!.id, agentB, at(2), ['CRITICAL', 'SUGGESTION']);

    const pulls = (await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` })).json();
    const listed = pulls.find((p: { id: string }) => p.id === pr!.id);
    expect(listed.findings_counts).toEqual({ CRITICAL: 1, WARNING: 1, SUGGESTION: 1 });
  });
});
