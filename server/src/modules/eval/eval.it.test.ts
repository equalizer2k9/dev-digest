import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('eval tables (Postgres)', () => {
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

  const mkAgent = async (name: string) =>
    (
      await pg.handle.db
        .insert(t.agents)
        .values({ workspaceId, name, provider: 'openai', model: 'm', systemPrompt: 'p' })
        .returning()
    )[0]!;
  const mkCase = (agentId: string, name: string, sourceFindingId?: string) =>
    pg.handle.db
      .insert(t.evalCases)
      .values({ workspaceId, ownerKind: 'agent', ownerId: agentId, agentId, name, sourceFindingId })
      .returning();
  const mkRun = (agentId: string, status: 'running' | 'completed' | 'failed') =>
    pg.handle.db
      .insert(t.evalRuns)
      .values({ workspaceId, agentId, agentVersion: 1, provider: 'openai', model: 'm', status })
      .returning();

  async function columns(table: string): Promise<Record<string, string>> {
    const rows = await pg.handle.db.execute<{ column_name: string; is_nullable: string }>(
      sql`select column_name, is_nullable from information_schema.columns where table_name = ${table}`,
    );
    return Object.fromEntries([...rows].map((r) => [r.column_name, r.is_nullable]));
  }

  it('AC-20: the new columns exist and eval_runs.case_id is nullable', async () => {
    const cases = await columns('eval_cases');
    for (const c of ['agent_id', 'source_finding_id', 'created_at']) expect(cases).toHaveProperty(c);
    const runs = await columns('eval_runs');
    for (const c of [
      'workspace_id', 'agent_id', 'agent_version', 'provider', 'model', 'skills', 'status',
      'has_errors', 'error', 'passed', 'total', 'results', 'finished_at',
    ]) {
      expect(runs).toHaveProperty(c);
    }
    expect(runs.case_id).toBe('YES');
  });

  it('AC-4: a second case with the same source_finding_id is rejected', async () => {
    const agent = await mkAgent('eval-uq');
    const fid = '22222222-2222-4222-8222-222222222222';
    await mkCase(agent.id, 'one', fid);
    await expect(mkCase(agent.id, 'two', fid)).rejects.toThrow();
    // cases without a source finding do not collide
    await mkCase(agent.id, 'free-1');
    await mkCase(agent.id, 'free-2');
  });

  it('AC-13: one running run per agent; running and completed coexist', async () => {
    const agent = await mkAgent('eval-running');
    await mkRun(agent.id, 'running');
    await expect(mkRun(agent.id, 'running')).rejects.toThrow();
    await mkRun(agent.id, 'completed');
    await mkRun(agent.id, 'completed');
    const other = await mkAgent('eval-running-2');
    await mkRun(other.id, 'running');
  });

  it('AC-23: deleting the agent removes its cases and runs', async () => {
    const db = pg.handle.db;
    const agent = await mkAgent('eval-cascade');
    await mkCase(agent.id, 'c');
    await mkRun(agent.id, 'completed');
    await db.delete(t.agents).where(eq(t.agents.id, agent.id));
    expect(await db.select().from(t.evalCases).where(eq(t.evalCases.agentId, agent.id))).toHaveLength(0);
    expect(await db.select().from(t.evalRuns).where(eq(t.evalRuns.agentId, agent.id))).toHaveLength(0);
  });
});
