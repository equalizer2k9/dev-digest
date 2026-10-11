/**
 * GET /pulls/:id/smart-diff — PR files grouped by role, each carrying the lines
 * of the current findings (each agent's latest review, dismissed included).
 * Deterministic: the LLM mock must record zero calls. Gated on Docker (needs
 * Postgres for pr_files / reviews / findings), like the other integration tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiff } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const ORDER = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Smart diff',
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
  return pr!;
}

async function addFiles(
  db: PgFixture['handle']['db'],
  prId: string,
  files: { path: string; additions: number; deletions: number }[],
) {
  await db.insert(t.prFiles).values(files.map((f) => ({ prId, ...f })));
}

async function addReview(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  prId: string,
  agentId: string,
  createdAt: Date,
  findings: { file: string; startLine: number; dismissed?: boolean }[],
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 50, createdAt })
    .returning();
  if (findings.length > 0) {
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.startLine,
        endLine: f.startLine,
        severity: 'WARNING',
        category: 'bug',
        title: 't',
        rationale: 'r',
        confidence: 0.9,
        dismissedAt: f.dismissed ? new Date() : null,
      })),
    );
  }
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider('openai');
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openai: llm }, embedder: new MockEmbedder() },
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/smart-diff` });

  it('PR with files and no review → 200, five groups in order, empty finding_lines', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    await addFiles(pg.handle.db, pr.id, [
      { path: 'src/a.ts', additions: 10, deletions: 2 },
      { path: 'pnpm-lock.yaml', additions: 40, deletions: 8 },
      { path: 'src/a.test.ts', additions: 5, deletions: 0 },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(ORDER);
    expect(body.groups.map((g) => g.files.map((f) => f.path))).toEqual([
      ['src/a.ts'],
      ['src/a.test.ts'],
      [],
      [],
      ['pnpm-lock.yaml'],
    ]);
    expect(body.groups.flatMap((g) => g.files.flatMap((f) => f.finding_lines))).toEqual([]);
    expect(body.split_suggestion).toEqual({ too_big: false, total_lines: 65, proposed_splits: [] });
    expect(llm.calls).toEqual([]);
  });

  it('PR without synced files → 200 with five empty groups', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    expect(body.groups.map((g) => g.role)).toEqual(ORDER);
    expect(body.split_suggestion.total_lines).toBe(0);
  });

  it('uses only each agent latest review, dismissed findings included', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    await addFiles(pg.handle.db, pr.id, [
      { path: 'src/a.ts', additions: 1, deletions: 1 },
      { path: 'src/b.ts', additions: 1, deletions: 1 },
    ]);
    const agentA = randomUUID();
    const agentB = randomUUID();
    const at = (m: number) => new Date(Date.UTC(2026, 0, 1, 0, m));
    // Older reviews: their findings must NOT show up.
    await addReview(pg.handle.db, workspaceId, pr.id, agentA, at(1), [{ file: 'src/a.ts', startLine: 100 }]);
    await addReview(pg.handle.db, workspaceId, pr.id, agentB, at(2), [{ file: 'src/b.ts', startLine: 200 }]);
    // Latest per agent.
    await addReview(pg.handle.db, workspaceId, pr.id, agentA, at(3), [
      { file: 'src/a.ts', startLine: 30 },
      { file: 'src/a.ts', startLine: 7, dismissed: true },
      { file: 'src/gone.ts', startLine: 1 },
    ]);
    await addReview(pg.handle.db, workspaceId, pr.id, agentB, at(4), [
      { file: 'src/a.ts', startLine: 30 },
      { file: 'src/b.ts', startLine: 12 },
    ]);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = SmartDiff.parse(res.json());
    const core = body.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => [f.path, f.finding_lines])).toEqual([
      ['src/a.ts', [7, 30]],
      ['src/b.ts', [12]],
    ]);
    expect(llm.calls).toEqual([]);
  });

  it('unknown id → 404', async () => {
    const res = await get(randomUUID());
    expect(res.statusCode).toBe(404);
  });

  it('malformed id → 422', async () => {
    const res = await get('not-a-uuid');
    expect(res.statusCode).toBe(422);
  });
});
