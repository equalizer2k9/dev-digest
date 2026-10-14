import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockEmbedder, MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** GET /pulls/:id persists the GitHub detail (files, commits, stats) idempotently. */
d('GET /pulls/:id persistence (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const github = new MockGitHubClient({
      detail: {
        body: 'fresh body',
        additions: 5,
        deletions: 2,
        files_count: 2,
        files: [
          { path: 'src/a.ts', additions: 3, deletions: 1, patch: 'p' },
          { path: 'src/b.ts', additions: 2, deletions: 1, patch: null },
        ],
        commits: [{ sha: 'c1', message: 'm', author: 'a', committed_at: null }],
      },
    });
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: { llm: { openai: new MockLLMProvider('openai') }, embedder: new MockEmbedder(), github },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('stores files/commits/stats and does not duplicate them on a second call', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'detail', fullName: 'acme/detail' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId, repoId: repo!.id, number: 3, title: 'T', author: 'a', branch: 'f', base: 'main',
        headSha: 'abc', additions: 0, deletions: 0, filesCount: 0, status: 'open',
      })
      .returning();

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${pr!.id}` });
      expect(res.statusCode).toBe(200);
    }

    const files = await db.select().from(t.prFiles).where(eq(t.prFiles.prId, pr!.id));
    expect(files.map((f) => f.path).sort()).toEqual(['src/a.ts', 'src/b.ts']);
    const commits = await db.select().from(t.prCommits).where(eq(t.prCommits.prId, pr!.id));
    expect(commits).toHaveLength(1);
    const [row] = await db.select().from(t.pullRequests).where(eq(t.pullRequests.id, pr!.id));
    expect(row).toMatchObject({ body: 'fresh body', additions: 5, deletions: 2, filesCount: 2 });
  });
});
