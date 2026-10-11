/**
 * GET /pulls/:id/blast — the PR's changed files → ONE repoIntel.getBlastRadius
 * call → BlastRadius + degraded/reason. Deterministic: LLM and embedder record
 * zero calls. repoIntel is a recording mock; Postgres is real (testcontainers).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { BlastRadius, BlastRadiusResponse } from '@devdigest/shared';
import type { PrDetail } from '@devdigest/shared';
import type { BlastResult, RepoIntel } from '../src/modules/repo-intel/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

class CountingGitHub extends MockGitHubClient {
  detailCalls = 0;
  failing = false;
  override async getPullRequest(repo: Parameters<MockGitHubClient['getPullRequest']>[0], n: number): Promise<PrDetail> {
    this.detailCalls++;
    if (this.failing) throw new Error('github down');
    return super.getPullRequest(repo, n);
  }
}

class EmbedderSpy extends MockEmbedder {
  embedCalls = 0;
  override async embed(...args: Parameters<MockEmbedder['embed']>) {
    this.embedCalls++;
    return super.embed(...args);
  }
}

let repoSeq = 0;
async function setupPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId, repoId: repo!.id, number: 7, title: 'Blast', author: 'a', branch: 'feat/x',
      base: 'main', headSha: 'abc', additions: 0, deletions: 0, filesCount: 0, status: 'open',
    })
    .returning();
  return pr!;
}

const FACADE_RESULT: BlastResult = {
  changedSymbols: [{ file: 'src/lib.ts', name: 'doIt', kind: 'function' }],
  callers: [
    { file: 'src/routes.ts', symbol: 'handler', viaSymbol: 'doIt', line: 12, rank: 3 },
    { file: 'src/lib.ts', symbol: 'self', viaSymbol: 'doIt', line: 3, rank: 9 },
  ],
  impactedEndpoints: ['GET /x'],
  factsByFile: { 'src/routes.ts': { endpoints: ['GET /x'], crons: ['nightly'] } },
  degraded: true,
  reason: 'index_partial',
};

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;
  let embedder: EmbedderSpy;
  let github: CountingGitHub;
  let blastCalls: { repoId: string; files: string[] }[];
  let facade: BlastResult;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider('openai');
    embedder = new EmbedderSpy();
    github = new CountingGitHub({
      detail: {
        files: [
          { path: 'src/lib.ts', additions: 1, deletions: 0, patch: null },
          { path: 'src/other.ts', additions: 2, deletions: 1, patch: null },
        ],
      },
    });
    const repoIntel = {
      getBlastRadius: async (repoId: string, files: string[]) => {
        blastCalls.push({ repoId, files });
        return facade;
      },
    } as unknown as RepoIntel;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openai: llm }, embedder, github, repoIntel },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });
  beforeEach(() => {
    blastCalls = [];
    facade = FACADE_RESULT;
    github.detailCalls = 0;
    github.failing = false;
    llm.calls.length = 0;
    embedder.embedCalls = 0;
  });

  const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/blast` });
  const addFiles = (prId: string, paths: string[]) =>
    pg.handle.db.insert(t.prFiles).values(paths.map((path) => ({ prId, path, additions: 1, deletions: 0 })));

  it('200: one facade call with PR paths + repo id; facade degraded/reason pass through; no LLM/embedder', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    await addFiles(pr.id, ['src/lib.ts', 'src/b.ts']);

    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    const body = BlastRadiusResponse.parse(res.json());
    BlastRadius.parse(res.json());
    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('index_partial');
    expect(body.changed_symbols).toHaveLength(1);
    // declaring-file caller dropped, real caller + its facts kept
    expect(body.downstream).toEqual([
      {
        symbol: 'doIt',
        callers: [{ name: 'handler', file: 'src/routes.ts', line: 12 }],
        endpoints_affected: ['GET /x'],
        crons_affected: ['nightly'],
      },
    ]);
    expect(body.summary).toBe('1 symbol · 1 caller · 1 endpoint · 1 cron');
    expect(blastCalls).toHaveLength(1);
    expect(blastCalls[0]!.repoId).toBe(pr.repoId);
    expect([...blastCalls[0]!.files].sort()).toEqual(['src/b.ts', 'src/lib.ts']);
    expect(github.detailCalls).toBe(0);
    expect(llm.calls).toEqual([]);
    expect(embedder.embedCalls).toBe(0);
  });

  it('not degraded → reason null', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    await addFiles(pr.id, ['src/lib.ts']);
    facade = { changedSymbols: [], callers: [], impactedEndpoints: [], degraded: false };
    const body = BlastRadiusResponse.parse((await get(pr.id)).json());
    expect(body).toMatchObject({ degraded: false, reason: null, downstream: [] });
  });

  it('no stored pr_files → GitHub asked once, rows stored, map served', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    expect(github.detailCalls).toBe(1);
    const rows = await pg.handle.db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr.id));
    expect(rows.map((r) => r.path).sort()).toEqual(['src/lib.ts', 'src/other.ts']);
    expect(blastCalls).toHaveLength(1);
    expect([...blastCalls[0]!.files].sort()).toEqual(['src/lib.ts', 'src/other.ts']);
    expect(BlastRadiusResponse.parse(res.json()).degraded).toBe(true);
  });

  it('no stored rows and GitHub failing → 200, empty, degraded no_data, facade not asked', async () => {
    const pr = await setupPr(pg.handle.db, workspaceId);
    github.failing = true;
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    expect(BlastRadiusResponse.parse(res.json())).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      reason: 'no_data',
    });
    expect(github.detailCalls).toBe(1);
    expect(blastCalls).toEqual([]);
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
