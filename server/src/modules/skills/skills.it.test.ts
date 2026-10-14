import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockGitClient, MockGitHubClient } from '../../adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills Lab — the `/skills` module against a REAL Postgres.
 *
 * The point of this suite (and of criterion 8) is that the routes are not a
 * facade: a skill created through the API is findable by a direct SELECT, and a
 * row deleted directly in the DB stops being returned by the API. So every
 * assertion here either crosses the HTTP boundary or goes straight to the
 * table — never through the service.
 */
d('/skills against Postgres', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const newSkill = (name: string) => ({
    name,
    description: 'Demands that every new branch is covered.',
    type: 'rubric' as const,
    body: '# Test quality\nCover every new branch.',
  });

  /** A multipart body with one file part, as the browser would send it. */
  function upload(filename: string, content: string, fields: Record<string, string> = {}) {
    const boundary = '----devdigestSkillsIt';
    const parts: Buffer[] = [];
    for (const [key, value] of Object.entries(fields)) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        ),
      );
    }
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
          `Content-Type: text/markdown\r\n\r\n`,
      ),
      Buffer.from(content),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    );
    return {
      payload: Buffer.concat(parts),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    };
  }

  // ---- AC-8: the routes really read and write Postgres ---------------------

  it('a skill created through POST /skills is findable by a direct SELECT (AC-8)', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-create') });
    expect(res.statusCode).toBe(201);
    const id = res.json().id as string;

    // Straight to the table — no service in the path.
    const rows = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('crud-create');
    expect(rows[0]!.source).toBe('manual');
    expect(rows[0]!.version).toBe(1);

    // Create also snapshots v1 into skill_versions, in the same transaction.
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(versions).toHaveLength(1);
    expect(versions[0]!.body).toBe(newSkill('crud-create').body);
  });

  it('a row deleted directly in the DB stops appearing in GET /skills (AC-8)', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-vanish') })
    ).json().id as string;

    const before = await app.inject({ method: 'GET', url: '/skills' });
    expect(before.json().map((s: { id: string }) => s.id)).toContain(id);

    // Delete behind the API's back.
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, id));

    const after = await app.inject({ method: 'GET', url: '/skills' });
    expect(after.json().map((s: { id: string }) => s.id)).not.toContain(id);
  });

  it('GET /skills/:id returns the skill and 404s an unknown id', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-read') })
    ).json().id as string;

    const hit = await app.inject({ method: 'GET', url: `/skills/${id}` });
    expect(hit.statusCode).toBe(200);
    expect(hit.json().name).toBe('crud-read');

    const miss = await app.inject({
      method: 'GET',
      url: '/skills/00000000-0000-0000-0000-000000000000',
    });
    expect(miss.statusCode).toBe(404);
  });

  // ---- AC-27/28/29: versioning is real and append-only ---------------------

  it('a body change bumps the version; a metadata-only change does not (AC-27)', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-versioned') })
    ).json().id as string;

    const bumped = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Test quality\nCover every new branch AND its boundary.' },
    });
    expect(bumped.json().version).toBe(2);

    // Toggling enabled must never create a version.
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { enabled: false },
    });
    expect(toggled.json().version).toBe(2);

    // Re-sending the identical body must not bump either.
    const same = await app.inject({
      method: 'PUT',
      url: `/skills/${id}`,
      payload: { body: '# Test quality\nCover every new branch AND its boundary.' },
    });
    expect(same.json().version).toBe(2);

    const list = await app.inject({ method: 'GET', url: `/skills/${id}/versions` });
    expect(list.json().map((v: { version: number }) => v.version)).toEqual([2, 1]);
  });

  it('restore appends a new version and rewrites no history (AC-28, AC-29)', async () => {
    const app = await makeApp();
    const id = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-restore') })
    ).json().id as string;
    const v1Body = newSkill('crud-restore').body;

    await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: 'v2 text' } });

    // AC-28 — the exact stored body of an older version, for the client's diff.
    const v1 = await app.inject({ method: 'GET', url: `/skills/${id}/versions/1` });
    expect(v1.json().body).toBe(v1Body);

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${id}/restore`,
      payload: { version: 1 },
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().version).toBe(3);
    expect(restored.json().body).toBe(v1Body);

    // Every historical row survives, untouched, straight from the table.
    const rows = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, id));
    expect(rows.map((r) => r.version).sort()).toEqual([1, 2, 3]);
    expect(rows.find((r) => r.version === 1)!.body).toBe(v1Body);
    expect(rows.find((r) => r.version === 2)!.body).toBe('v2 text');
  });

  // ---- AC-22/AC-37: agent_count in one grouped query -----------------------

  it('agent_count reflects the agents that link the skill (AC-22, AC-37)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-counted') })
    ).json().id as string;

    const mkAgent = async (name: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: {
            name,
            provider: 'openai' as const,
            model: 'gpt-4o-mini',
            system_prompt: 'Review the diff.',
          },
        })
      ).json().id as string;

    const a1 = await mkAgent('Counter A');
    const a2 = await mkAgent('Counter B');

    const unlinked = await app.inject({ method: 'GET', url: '/skills' });
    // AC-37 — an unlinked skill is still listed, at zero.
    expect(unlinked.json().find((s: { id: string }) => s.id === skillId).agent_count).toBe(0);

    for (const agentId of [a1, a2]) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentId}/skills`,
        payload: { skill_ids: [skillId] },
      });
      expect(res.statusCode).toBe(200);
    }

    const linked = await app.inject({ method: 'GET', url: '/skills' });
    const row = linked.json().find((s: { id: string }) => s.id === skillId);
    expect(row.agent_count).toBe(2);
    expect(row.version).toBe(1);
    expect(row.type).toBe('rubric');
  });

  // ---- AC-23: delete cascades ----------------------------------------------

  it('DELETE /skills/:id removes the row and cascades versions + links (AC-23)', async () => {
    const app = await makeApp();
    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: newSkill('crud-doomed') })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { body: 'v2' } });

    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Doomed Linker',
          provider: 'openai' as const,
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: [skillId] },
    });

    const del = await app.inject({ method: 'DELETE', url: `/skills/${skillId}` });
    expect(del.statusCode).toBe(204);

    // Cascades, verified on the tables themselves.
    expect(
      await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skillId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db
        .select()
        .from(t.skillVersions)
        .where(eq(t.skillVersions.skillId, skillId)),
    ).toHaveLength(0);
    expect(
      await pg.handle.db
        .select()
        .from(t.agentSkills)
        .where(eq(t.agentSkills.skillId, skillId)),
    ).toHaveLength(0);

    // The agent that linked it still works — it just assembles one skill fewer.
    const agent = await app.inject({ method: 'GET', url: `/agents/${agentId}` });
    expect(agent.statusCode).toBe(200);
    const links = await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` });
    expect(links.json()).toEqual([]);
  });

  // ---- AC-15/AC-16: import writes source = 'imported_file' -----------------

  it('preview persists nothing; import persists source = imported_file (AC-15, AC-16)', async () => {
    const app = await makeApp();
    const md = '# Imported Rubric\n\nDemands boundary coverage.\n\n- rule one\n';

    const countSkills = async () => (await pg.handle.db.select().from(t.skills)).length;
    const before = await countSkills();

    const preview = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      ...upload('imported-rubric.md', md),
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().source).toBe('imported_file');
    expect(preview.json().name).toBe('imported-rubric');
    expect(preview.json().body).toBe(md);
    // The whole point of a preview: nothing reached the database.
    expect(await countSkills()).toBe(before);

    const imported = await app.inject({
      method: 'POST',
      url: '/skills/import',
      ...upload('imported-rubric.md', md, { name: 'corrected-on-preview', type: 'security' }),
    });
    expect(imported.statusCode).toBe(201);
    const id = imported.json().id as string;

    // AC-16, read straight from the table: the row's source is imported_file.
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, id));
    expect(row!.source).toBe('imported_file');
    // The preview corrections were honoured over the parsed values.
    expect(row!.name).toBe('corrected-on-preview');
    expect(row!.type).toBe('security');
    expect(row!.body).toBe(md);

    // …and the API reports it, which is what the client labels "Imported".
    const listed = await app.inject({ method: 'GET', url: '/skills' });
    expect(listed.json().find((s: { id: string }) => s.id === id).source).toBe('imported_file');
  });

  it('rejects an unsupported upload format with 415 (AC-15)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      ...upload('skills.tar', 'not markdown'),
    });
    expect(res.statusCode).toBe(415);
  });
});
