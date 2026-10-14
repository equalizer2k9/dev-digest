import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider, MockEmbedder } from '../../adapters/mocks.js';
import { FileTooLargeError } from '../../adapters/file-too-large.js';
import { PathEscapeError } from '@devdigest/shared';
import { documentTag } from './helpers.js';
import { ProjectContextList, ProjectContextAttachments } from '@devdigest/shared';
import type { RepoRef } from '@devdigest/shared';
import { waitForPrRuns } from '../../../test/helpers/runs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('project context attachment tables (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function columns(table: string): Promise<string[]> {
    const rows = await pg.handle.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = ${table} order by column_name`,
    );
    return [...rows].map((r) => r.column_name).sort();
  }

  it('AC-12: each table holds exactly owner id, repo_id, position and path', async () => {
    expect(await columns('agent_context_docs')).toEqual(['agent_id', 'path', 'position', 'repo_id']);
    expect(await columns('skill_context_docs')).toEqual(['path', 'position', 'repo_id', 'skill_id']);
  });

  it('AC-36: rows go away with the agent, the skill and the repository, each in turn', async () => {
    const db = pg.handle.db;
    const mkRepo = async (name: string) =>
      (await db.insert(t.repos).values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` }).returning())[0]!;
    const mkAgent = async (name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
          .returning()
      )[0]!;
    const mkSkill = async (name: string) =>
      (
        await db
          .insert(t.skills)
          .values({ workspaceId, name, description: 'd', type: 'custom', source: 'manual', body: 'b' })
          .returning()
      )[0]!;
    const count = async (table: string) =>
      Number([...(await db.execute<{ n: string }>(sql.raw(`select count(*) as n from ${table}`)))][0]!.n);

    const repoA = await mkRepo('ctx-a');
    const repoB = await mkRepo('ctx-b');
    const repoC = await mkRepo('ctx-c');
    const agent = await mkAgent('ctx-agent');
    const skill = await mkSkill('ctx-skill');
    const agent2 = await mkAgent('ctx-agent2');

    await db.insert(t.agentContextDocs).values([
      { agentId: agent.id, repoId: repoA.id, position: 0, path: 'docs/a.md' },
      { agentId: agent2.id, repoId: repoB.id, position: 0, path: 'docs/a.md' },
      { agentId: agent2.id, repoId: repoC.id, position: 0, path: 'docs/a.md' },
    ]);
    await db.insert(t.skillContextDocs).values({
      skillId: skill.id,
      repoId: repoA.id,
      position: 0,
      path: 'docs/a.md',
    });
    expect(await count('agent_context_docs')).toBe(3);

    await db.delete(t.agents).where(eq(t.agents.id, agent.id));
    expect(await count('agent_context_docs')).toBe(2);

    await db.delete(t.skills).where(eq(t.skills.id, skill.id));
    expect(await count('skill_context_docs')).toBe(0);

    await db.delete(t.repos).where(eq(t.repos.id, repoB.id));
    expect(await count('agent_context_docs')).toBe(1);
  });
});

/** Strict fake: unknown paths throw ENOENT like the real client; special entries throw. */
class FakeGit extends MockGitClient {
  readAtRefCalls = 0;
  constructor(private tree: Record<string, string | Error>, diff?: string) {
    super(diff ? { diff } : {});
  }
  async listFiles(_r: RepoRef, opts: { accept(p: string): boolean; limit: number }) {
    const paths = Object.keys(this.tree).filter((p) => opts.accept(p)).sort();
    return { paths: paths.slice(0, opts.limit), truncated: paths.length > opts.limit };
  }
  async readFile(_r: RepoRef, path: string, maxBytes?: number): Promise<string> {
    const v = this.tree[path];
    if (v === undefined) throw Object.assign(new Error(`ENOENT /clone/${path}`), { code: 'ENOENT' });
    if (v instanceof Error) throw v;
    if (maxBytes !== undefined && Buffer.byteLength(v) > maxBytes) {
      throw new FileTooLargeError(path, Buffer.byteLength(v), maxBytes);
    }
    return v;
  }
  async readFileAtRef(): Promise<string> {
    this.readAtRefCalls++;
    throw new Error('readFileAtRef must not be called');
  }
}

d('project-context routes (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let repoId: string;
  let agentId: string;
  let skillId: string;
  const TREE: Record<string, string | Error> = {
    'docs/a.md': 'Alpha document',
    'docs/b.md': 'Beta document',
    'specs/s.md': 'Spec text',
    'docs/big.md': 'x'.repeat(20_001),
    'docs/esc.md': new PathEscapeError('docs/esc.md'),
    'docs/denied.md': Object.assign(new Error('EACCES: permission denied /clone/docs/denied.md'), {
      code: 'EACCES',
    }),
    'src/a.md': 'not a document',
    'docs/a.txt': 'not md',
  };

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-routes', fullName: 'acme/ctx-routes', clonePath: '/clones/acme/ctx-routes' })
      .returning();
    repoId = repo!.id;
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'ctx-routes-agent', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    agentId = agent!.id;
    const [skill] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'ctx-routes-skill', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    skillId = skill!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const makeApp = () =>
    buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { git: new FakeGit(TREE), github: new MockGitHubClient() },
    });

  it('AC-1/AC-16: lists the documents in path order, each with tag and tokens', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context` });
    expect(res.statusCode).toBe(200);
    const body = ProjectContextList.parse(res.json());
    expect(body.has_clone).toBe(true);
    expect(body.documents.map((d) => d.path)).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/big.md',
      'docs/denied.md',
      'docs/esc.md',
      'specs/s.md',
    ]);
    expect(body.documents[0]).toMatchObject({ tag: 'docs', too_large: false });
    expect(body.documents[0]!.tokens).toBeGreaterThan(0);
    expect(body.documents.find((d) => d.path === 'docs/big.md')).toMatchObject({ tokens: null, too_large: true });
    await app.close();
  });

  it('AC-4: preview returns the text; unknown 404; too large 413', async () => {
    const app = await makeApp();
    const get = (path: string) =>
      app.inject({ method: 'GET', url: `/repos/${repoId}/context/document`, query: { path } });
    const ok = await get('docs/a.md');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ path: 'docs/a.md', content: 'Alpha document' });
    expect((await get('docs/none.md')).statusCode).toBe(404);
    expect((await get('docs/big.md')).statusCode).toBe(413);
    await app.close();
  });

  it('AC-23/EC-3/NFR-3: an escape answers like an unknown path; EACCES is 422; no leak', async () => {
    const app = await makeApp();
    const get = (path: string) =>
      app.inject({ method: 'GET', url: `/repos/${repoId}/context/document`, query: { path } });
    const unknown = await get('docs/none.md');
    const escaped = await get('docs/esc.md');
    expect(escaped.statusCode).toBe(404);
    expect(escaped.json()).toEqual(unknown.json());
    const denied = await get('docs/denied.md');
    expect(denied.statusCode).toBe(422);
    expect(denied.json().error.code).toBe('context_document_unreadable');
    for (const r of [unknown, escaped, denied]) {
      expect(r.body).not.toContain('/clone');
      expect(r.body).not.toContain('EACCES');
      expect(r.body).not.toContain('permission denied');
    }
    await app.close();
  });

  for (const kind of ['agents', 'skills'] as const) {
    it(`AC-8: PUT then GET /${kind}/:id/context round-trips the ordered list and fills the table`, async () => {
      const app = await makeApp();
      const id = kind === 'agents' ? agentId : skillId;
      const put = await app.inject({
        method: 'PUT',
        url: `/${kind}/${id}/context`,
        payload: { repo_id: repoId, paths: ['docs/b.md', 'docs/a.md'] },
      });
      expect(put.statusCode).toBe(200);
      const got = await app.inject({ method: 'GET', url: `/${kind}/${id}/context`, query: { repo_id: repoId } });
      const body = ProjectContextAttachments.parse(got.json());
      expect(body.attached).toEqual(['docs/b.md', 'docs/a.md']);
      expect(ProjectContextAttachments.parse(put.json()).attached).toEqual(body.attached);
      const rows =
        kind === 'agents'
          ? await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, id))
          : await pg.handle.db.select().from(t.skillContextDocs).where(eq(t.skillContextDocs.skillId, id));
      expect(rows.sort((x, y) => x.position - y.position).map((r) => r.path)).toEqual(['docs/b.md', 'docs/a.md']);
      await app.close();
    });
  }

  it('AC-14: refused paths give 422 context_path_invalid and the table is unchanged', async () => {
    const app = await makeApp();
    const before = await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
    for (const path of ['../etc/passwd.md', '/docs/a.md', 'docs/a.txt', 'src/a.md', 'docs/gone.md']) {
      expect(documentTag(path) === null || path === 'docs/gone.md').toBe(true);
      const res = await app.inject({
        method: 'PUT',
        url: `/agents/${agentId}/context`,
        payload: { repo_id: repoId, paths: ['docs/a.md', path] },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error.code).toBe('context_path_invalid');
    }
    const after = await pg.handle.db.select().from(t.agentContextDocs).where(eq(t.agentContextDocs.agentId, agentId));
    expect(after).toEqual(before);
    await app.close();
  });

  it('AC-15: ids of another workspace answer 404 not_found on every route', async () => {
    const db = pg.handle.db;
    const [other] = await db.insert(t.workspaces).values({ name: 'other-ctx' }).returning();
    const [oRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: other!.id, owner: 'o', name: 'r', fullName: 'o/r', clonePath: '/c' })
      .returning();
    const [oAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: other!.id, name: 'oa', provider: 'openai', model: 'm', systemPrompt: 'p' })
      .returning();
    const [oSkill] = await db
      .insert(t.skills)
      .values({ workspaceId: other!.id, name: 'os', description: 'd', type: 'custom', source: 'manual', body: 'b' })
      .returning();
    const app = await makeApp();
    const calls = [
      app.inject({ method: 'GET', url: `/repos/${oRepo!.id}/context` }),
      app.inject({ method: 'GET', url: `/repos/${oRepo!.id}/context/document`, query: { path: 'docs/a.md' } }),
      app.inject({ method: 'GET', url: `/agents/${oAgent!.id}/context`, query: { repo_id: repoId } }),
      app.inject({ method: 'GET', url: `/agents/${agentId}/context`, query: { repo_id: oRepo!.id } }),
      app.inject({ method: 'PUT', url: `/agents/${oAgent!.id}/context`, payload: { repo_id: repoId, paths: [] } }),
      app.inject({ method: 'GET', url: `/skills/${oSkill!.id}/context`, query: { repo_id: repoId } }),
      app.inject({ method: 'PUT', url: `/skills/${skillId}/context`, payload: { repo_id: oRepo!.id, paths: [] } }),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    }
    await app.close();
  });

  it('a PUT with a missing repo_id is 422', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'PUT', url: `/agents/${agentId}/context`, payload: { paths: [] } });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const REVIEW = { verdict: 'comment', summary: 'ok', score: 100, findings: [] };
const SENTENCE = '`api/` does not import `db/` directly';

d('project context in a review run (Postgres)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('AC-27/AC-25/AC-17: an attached document reaches the model and the trace records it', async () => {
    const db = pg.handle.db;
    const [ws] = await db.select().from(t.workspaces);
    const workspaceId = ws!.id;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-run', fullName: 'acme/ctx-run', clonePath: '/clones/acme/ctx-run' })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'a',
        branch: 'feat',
        base: 'main',
        headSha: 'a1b2c3d4',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'body',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });

    const git = new FakeGit({ 'docs/architecture.md': SENTENCE }, DIFF);
    const llm = new MockLLMProvider('openai', { structured: REVIEW });
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db,
      overrides: { embedder: new MockEmbedder(), git, llm: { openai: llm } },
    });

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Ctx', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const put = await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}/context`,
      payload: { repo_id: repo!.id, paths: ['docs/architecture.md'] },
    });
    expect(put.statusCode).toBe(200);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(db, pr!.id, { expected: 1 });

    const call = llm.calls.find((c) => c.method === 'completeStructured');
    const messages = (call!.req as { messages: { role: string; content: string }[] }).messages;
    const user = messages.find((m) => m.role === 'user')!.content;
    const system = messages.find((m) => m.role === 'system')!.content;
    expect(user).toContain(`Path: docs/architecture.md\n\n${SENTENCE}`);
    expect(system).toContain('PROJECT DOCUMENTS');

    const runId = res.json().runs[0].run_id;
    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.project_context).toHaveLength(1);
    expect(trace.project_context[0]).toMatchObject({ path: 'docs/architecture.md', skip_reason: null });
    expect(trace.project_context[0].tokens).toBeGreaterThan(0);
    expect(trace.specs_read).toEqual([]);
    expect(git.readAtRefCalls).toBe(0);
    await app.close();
  });
});
