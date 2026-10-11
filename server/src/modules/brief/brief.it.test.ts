import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { FEATURE_MODELS, PrBrief, type FeatureModelDef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockEmbedder, MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';
import type { BlastResult, RepoIntel } from '../repo-intel/types.js';
import { BRIEF_FEATURE } from './constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const PATCH = '@@ -1,2 +10,5 @@\n+x';
const FACADE: BlastResult = {
  changedSymbols: [{ file: 'src/lib.ts', name: 'doIt', kind: 'function' }],
  callers: [{ file: 'src/routes.ts', symbol: 'handler', viaSymbol: 'doIt', line: 12, rank: 3 }],
  impactedEndpoints: [],
  factsByFile: {},
};

const REPLY = {
  summary: 'Adds doIt.',
  risks: [
    { kind: 'k', title: 'low risk', explanation: 'e', severity: 'low', file_refs: ['src/lib.ts'] },
    { kind: 'k', title: 'invented', explanation: 'e', severity: 'high', file_refs: ['src/nope.ts'] },
    { kind: 'k', title: 'high risk', explanation: 'e', severity: 'high', file_refs: ['src/routes.ts'] },
  ],
  review_focus: [
    { file: 'src/lib.ts', line: 11, reason: 'core' },
    { file: 'src/lib.ts', line: 99, reason: 'not a known line' },
  ],
};

/** /pulls/:id/brief against a REAL Postgres; LLM is a recording mock. */
d('/pulls/:id/brief against Postgres', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let llm: MockLLMProvider;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let seq = 0;

  const feature: FeatureModelDef = FEATURE_MODELS.find((f) => f.id === BRIEF_FEATURE)!;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    llm = new MockLLMProvider(feature.defaultProvider === 'anthropic' ? 'anthropic' : 'openai', {
      structured: REPLY,
    });
    const repoIntel = { getBlastRadius: async () => FACADE } as unknown as RepoIntel;
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        llm: { [feature.defaultProvider]: llm },
        embedder: new MockEmbedder(),
        github: new MockGitHubClient(),
        repoIntel,
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });
  beforeEach(() => {
    llm.calls.length = 0;
  });

  async function setupPr(opts: { files?: boolean; status?: string; workspace?: string } = {}) {
    const db = pg.handle.db;
    const ws = opts.workspace ?? workspaceId;
    const name = `brief-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws, repoId: repo!.id, number: 1, title: 'Brief me', author: 'a', branch: 'f',
        base: 'main', headSha: 'row-sha', status: opts.status ?? 'open', body: 'why',
      })
      .returning();
    if (opts.files !== false) {
      await db.insert(t.prFiles).values([
        { prId: pr!.id, path: 'src/lib.ts', additions: 3, deletions: 1, patch: PATCH },
        { prId: pr!.id, path: 'README.md', additions: 1, deletions: 0, patch: null },
      ]);
    }
    return pr!;
  }

  const get = (id: string) => app.inject({ method: 'GET', url: `/pulls/${id}/brief` });
  const post = (id: string, body: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${id}/brief`, payload: body as object });
  const rows = (id: string) =>
    pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, id));
  const modelCalls = () => llm.calls.filter((c) => c.method === 'completeStructured');

  it('GET before any generation -> 200 { brief: null }', async () => {
    const pr = await setupPr();
    const res = await get(pr.id);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ brief: null });
  });

  it('POST stores a grounded brief with the body SHA; GET returns it with no model call', async () => {
    const pr = await setupPr();
    const res = await post(pr.id, { head_sha: 'page-sha-1' });
    expect(res.statusCode).toBe(200);
    const { brief } = res.json();
    PrBrief.parse(brief);
    expect(brief.head_sha).toBe('page-sha-1');
    expect(brief.risks.map((r: { title: string }) => r.title)).toEqual(['high risk', 'low risk']);
    expect(brief.review_focus).toEqual([{ file: 'src/lib.ts', line: 11, reason: 'core' }]);
    expect(await rows(pr.id)).toHaveLength(1);
    expect(modelCalls()).toHaveLength(1);

    const again = await get(pr.id);
    expect(again.json()).toEqual({ brief });
    expect(modelCalls()).toHaveLength(1);
  });

  it('a second POST with another SHA replaces the brief: one row, one more model call', async () => {
    const pr = await setupPr();
    await post(pr.id, { head_sha: 'sha-a' });
    const res = await post(pr.id, { head_sha: 'sha-b' });
    expect(res.json().brief.head_sha).toBe('sha-b');
    expect(await rows(pr.id)).toHaveLength(1);
    expect(modelCalls()).toHaveLength(2);
    expect((await get(pr.id)).json().brief.head_sha).toBe('sha-b');
  });

  it('closed and merged PRs generate', async () => {
    for (const status of ['closed', 'merged']) {
      const pr = await setupPr({ status });
      expect((await post(pr.id, { head_sha: 's' })).statusCode).toBe(200);
    }
  });

  it('a PR without pr_files -> 409 brief_no_files, no model call', async () => {
    const pr = await setupPr({ files: false });
    const res = await post(pr.id, { head_sha: 's' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('brief_no_files');
    expect(modelCalls()).toHaveLength(0);
    expect(await rows(pr.id)).toHaveLength(0);
  });

  it('uses the registry default, then the model saved in Settings on the next call', async () => {
    const pr = await setupPr();
    await post(pr.id, { head_sha: 's1' });
    expect((modelCalls()[0]!.req as { model: string }).model).toBe(feature.defaultModel);

    const put = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: {
        feature_models: { [BRIEF_FEATURE]: { provider: feature.defaultProvider, model: 'it-brief-model-v2' } },
      },
    });
    expect(put.statusCode).toBeLessThan(300);
    await post(pr.id, { head_sha: 's2' });
    expect((modelCalls()[1]!.req as { model: string }).model).toBe('it-brief-model-v2');
  });

  it('a PR of another workspace -> 404 not_found on GET and POST', async () => {
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other' }).returning();
    const pr = await setupPr({ workspace: other!.id });
    const g = await get(pr.id);
    expect(g.statusCode).toBe(404);
    expect(g.json().error.code).toBe('not_found');
    const p = await post(pr.id, { head_sha: 's' });
    expect(p.statusCode).toBe(404);
    expect(p.json().error.code).toBe('not_found');
    expect(modelCalls()).toHaveLength(0);
  });

  it('a missing or empty head_sha -> 422', async () => {
    const pr = await setupPr();
    expect((await post(pr.id, {})).statusCode).toBe(422);
    expect((await post(pr.id, { head_sha: '' })).statusCode).toBe(422);
    expect(modelCalls()).toHaveLength(0);
  });
});
