import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { FEATURE_MODELS, type FeatureModelDef } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../platform/config.js';
import { seed, DEFAULT_WORKSPACE_NAME } from '../../db/seed.js';
import * as t from '../../db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../../adapters/mocks.js';
import type { RepoIntel } from '../repo-intel/types.js';
import { CONVENTIONS_FEATURE, DEFAULT_SKILL_NAME } from './constants.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions extractor — the `/conventions` module against a REAL Postgres.
 *
 * The suite exists to prove the parts a mocked repository cannot: that a scan
 * SURVIVES the process (every "after a restart" assertion rebuilds the app from
 * scratch and re-reads through HTTP, or goes straight to the table), that a
 * `rejected` tombstone still blocks a rescan after that restart, and that the
 * accepted rows really become one `source = 'extracted'` skill that the agents
 * and skills modules can see.
 *
 * Provider/model literals are deliberately absent: the provider comes from the
 * feature registry and the model is an opaque string this test writes into
 * Settings → Models, which is also how AC-53 is proven here.
 */
d('/conventions against Postgres', () => {
  let pg: PgFixture;
  let workspaceId: string;

  /** The registry entry for this feature — the only source of a provider id. */
  const feature: FeatureModelDef = FEATURE_MODELS.find((f) => f.id === CONVENTIONS_FEATURE)!;

  /** What Settings → Models is set to; the scan must report exactly this. */
  const CHOSEN_MODEL = 'it-conventions-model-v1';

  // ---- Fixture clone -------------------------------------------------------

  const RUN_EXECUTOR = [
    "import { NotFoundError } from '../platform/errors.js';",
    '',
    'export async function runExecutor(id: string) {',
    '  if (!id) throw new NotFoundError(`no run ${id}`);',
    '  return { id };',
    '}',
  ];
  const REPO_INTEL = [
    'export class RepoIntelService {',
    '  async getState(repoId: string) {',
    '    return this.repo.getState(repoId);',
    '  }',
    '}',
  ];
  const FILES: Record<string, string> = {
    'tsconfig.json': '{\n  "compilerOptions": { "strict": true }\n}',
    'src/run-executor.ts': RUN_EXECUTOR.join('\n'),
    'src/repo-intel.ts': REPO_INTEL.join('\n'),
  };
  const RANKED = ['src/run-executor.ts', 'src/repo-intel.ts'];
  const HEAD_SHA = 'ffee0011';

  const KEBAB_RULE = 'Files and folders are named in kebab-case';
  const ERRORS_RULE = 'Services throw NotFoundError instead of returning null';

  /**
   * Four candidates as the model would answer: two citable, one inventing a
   * path that was never sampled, one whose range runs past the file's end. The
   * last two must be dropped in code and counted (AC-40b).
   */
  function llmFixture(rules: { kebab?: string; errors?: string } = {}) {
    return {
      candidates: [
        {
          category: 'naming',
          rule: rules.kebab ?? KEBAB_RULE,
          evidence: { file: 'src/run-executor.ts', start_line: 3, end_line: 4 },
          confidence: 0.95,
        },
        {
          category: 'error-handling',
          rule: rules.errors ?? ERRORS_RULE,
          evidence: { file: 'src/repo-intel.ts', start_line: 2, end_line: 3 },
          confidence: 0.8,
        },
        {
          category: 'structure',
          rule: 'Every module keeps its helpers in a helpers file',
          evidence: { file: 'src/never-sampled.ts', start_line: 1, end_line: 2 },
          confidence: 0.7,
        },
        {
          category: 'typing',
          rule: 'Public functions always declare their return type',
          evidence: { file: 'src/repo-intel.ts', start_line: 4, end_line: 9 },
          confidence: 0.6,
        },
      ],
    };
  }

  /** The snippet the verifier must have re-read from the file for candidate 1. */
  const KEBAB_SNIPPET = RUN_EXECUTOR.slice(2, 4).join('\n');

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db
      .select()
      .from(t.workspaces)
      .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
    workspaceId = ws!.id;

    // Settings → Models for this feature, written through the real route later;
    // seeding it here keeps the very first scan on the chosen model too.
    await pg.handle.db.insert(t.settings).values({
      workspaceId,
      userId: null,
      key: 'feature_models',
      value: { [CONVENTIONS_FEATURE]: { provider: feature.defaultProvider, model: CHOSEN_MODEL } },
    });
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * A fresh app on the same database — every call here is "after a restart":
   * nothing is carried over but the rows.
   */
  function makeApp(opts: { fixture?: unknown; ranked?: string[]; files?: Record<string, string> } = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider(undefined, { structured: opts.fixture ?? llmFixture() });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: opts.files ?? FILES, head: HEAD_SHA }),
        github: new MockGitHubClient(),
        llm: { [feature.defaultProvider]: llm },
        repoIntel: {
          getConventionSamples: async () => opts.ranked ?? RANKED,
        } as unknown as RepoIntel,
      },
    });
  }

  /** A repo of this test's own, so no two cases share candidate rows. */
  async function newRepo(slug: string): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: slug,
        fullName: `acme/${slug}`,
        defaultBranch: 'main',
      })
      .returning();
    return row!.id;
  }

  // ---- AC-38 / AC-40 / AC-40b / AC-53 --------------------------------------

  it('extract persists the scan and a restart re-reads it unchanged (AC-38)', async () => {
    const repoId = await newRepo('extract-persists');

    const scan = (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const res = await scan;
    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Two survivors, confidence descending; the model's two unciteable
    // candidates were dropped in code, not by the model (AC-40b).
    expect(body.candidates.map((c: { rule: string }) => c.rule)).toEqual([KEBAB_RULE, ERRORS_RULE]);
    expect(body.dropped).toBe(2);
    expect(body.sample_files).toBe(3);
    expect(body.extracted_at).not.toBeNull();
    // The model reported is the one Settings → Models holds, nothing hardcoded
    // in the module (AC-53).
    expect(body.model).toBe(CHOSEN_MODEL);
    expect(body.candidates[0].head_sha).toBe(HEAD_SHA);
    expect(body.candidates[0].status).toBe('pending');

    // Straight to the table: the snippet is the file's REAL lines for the cited
    // range, never the model's text (AC-40b).
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.repoId, repoId), eq(t.conventions.rule, KEBAB_RULE)));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.evidenceSnippet).toBe(KEBAB_SNIPPET);
    expect(rows[0]!.evidenceStartLine).toBe(3);
    expect(rows[0]!.evidenceEndLine).toBe(4);
    expect(rows[0]!.scanId).not.toBeNull();

    // The scan row carries what the scan itself did.
    const scans = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    expect(scans).toHaveLength(1);
    expect(scans[0]!.headSha).toBe(HEAD_SHA);
    expect(scans[0]!.model).toBe(CHOSEN_MODEL);
    expect(scans[0]!.dropped).toBe(2);

    // A brand-new app instance — the restart — returns the same candidates.
    const after = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions`,
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().candidates).toEqual(body.candidates);
    expect(after.json().model).toBe(CHOSEN_MODEL);
  });

  it('a never-scanned repo reports extracted_at null, and an unsampled repo 409s', async () => {
    const repoId = await newRepo('never-scanned');

    const empty = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions`,
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({
      repo_id: repoId,
      candidates: [],
      extracted_at: null,
      model: null,
    });

    // Nothing ranked AND no config readable → the spec's 409, with its code.
    const blind = await (await makeApp({ ranked: [], files: {} })).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(blind.statusCode).toBe(409);
    expect(blind.json().error.code).toBe('repo_not_indexed');
  });

  it('a model reply that does not fit the schema is a typed error, not a 500 stack (AC-40)', async () => {
    const repoId = await newRepo('malformed-reply');
    const app = await makeApp({ fixture: { candidates: [{ rule: 'too short' }] } });

    const res = await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('external_service_error');
    expect(res.json().error.message).toBeTypeOf('string');
    // Nothing was written for a failed scan.
    const scans = await pg.handle.db
      .select()
      .from(t.conventionScans)
      .where(eq(t.conventionScans.repoId, repoId));
    expect(scans).toHaveLength(0);
  });

  // ---- AC-48 ---------------------------------------------------------------

  it('a rejected candidate is gone after a restart and a rescan cannot revive it (AC-48)', async () => {
    const repoId = await newRepo('reject-sticks');
    const first = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const candidates = first.json().candidates as { id: string; rule: string }[];
    const doomed = candidates.find((c) => c.rule === ERRORS_RULE)!;
    const keeper = candidates.find((c) => c.rule === KEBAB_RULE)!;

    const rejected = await (await makeApp()).inject({
      method: 'PUT',
      url: `/conventions/${doomed.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json().status).toBe('rejected');

    // Accept the other one so a draft exists to check the rejected rule against.
    await (await makeApp()).inject({
      method: 'PUT',
      url: `/conventions/${keeper.id}`,
      payload: { status: 'accepted' },
    });

    // Restart → the rejected row is not on the wire, and not in the draft.
    const reread = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions`,
    });
    expect(reread.json().candidates.map((c: { id: string }) => c.id)).toEqual([keeper.id]);

    const draft = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/draft`,
    });
    expect(draft.json().count).toBe(1);
    expect(draft.json().body).toContain(KEBAB_RULE);
    expect(draft.json().body).not.toContain(ERRORS_RULE);

    // The tombstone is still a row — that is what blocks the rediscovery.
    const tomb = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.id, doomed.id));
    expect(tomb[0]!.status).toBe('rejected');

    // A rescan finds the same two rules again: the accepted one is untouched and
    // the rejected one does not come back.
    const rescan = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const after = rescan.json().candidates as { id: string; rule: string }[];
    expect(after.map((c) => c.rule)).toEqual([KEBAB_RULE]);
    expect(after[0]!.id).toBe(keeper.id); // the accepted row was kept, not replaced
  });

  it('a rescan replaces pending rows and keeps a rule the user reworded', async () => {
    const repoId = await newRepo('rescan-merge');
    const first = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const pendingIds = (first.json().candidates as { id: string }[]).map((c) => c.id);

    const rescan = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const ids = (rescan.json().candidates as { id: string }[]).map((c) => c.id);

    // Same two rules, but they are NEW rows — the pending ones were replaced.
    expect(rescan.json().candidates).toHaveLength(2);
    for (const id of ids) expect(pendingIds).not.toContain(id);
    const rows = await pg.handle.db
      .select()
      .from(t.conventions)
      .where(eq(t.conventions.repoId, repoId));
    expect(rows).toHaveLength(2);
  });

  // ---- AC-41 / AC-42 / AC-52 ----------------------------------------------

  it('the draft becomes an extracted skill with the EDITED values and an agent link (AC-41, AC-42, AC-52)', async () => {
    const repoId = await newRepo('draft-to-skill');
    const scan = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const candidates = scan.json().candidates as { id: string; rule: string }[];

    // Nothing accepted yet → no draft to build.
    const tooEarly = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/draft`,
    });
    expect(tooEarly.statusCode).toBe(409);

    for (const c of candidates) {
      await (await makeApp()).inject({
        method: 'PUT',
        url: `/conventions/${c.id}`,
        payload: { status: 'accepted' },
      });
    }

    const draftRes = await (await makeApp()).inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/draft`,
    });
    const draft = draftRes.json();
    expect(draft.name).toBe(DEFAULT_SKILL_NAME);
    expect(draft.type).toBe('convention');
    expect(draft.enabled).toBe(true);
    expect(draft.count).toBe(2);
    expect(draft.body).toContain('src/run-executor.ts:L3-L4');
    expect(draft.body).toContain(KEBAB_SNIPPET);

    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));

    // The user edits every field before saving; what is persisted is the edit,
    // never the draft's own values (AC-41).
    const edited = {
      name: draft.name,
      description: 'Hand-tightened description',
      type: 'custom',
      enabled: false,
      body: `${draft.body}\n\n## hand-added-rule\n\nNever commit a lockfile by hand.`,
      agent_id: agent!.id,
    };
    const created = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: edited,
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.source).toBe('extracted');
    expect(skill.description).toBe(edited.description);
    expect(skill.type).toBe('custom');
    expect(skill.enabled).toBe(false);
    expect(skill.body).toBe(edited.body);
    expect(skill.version).toBe(1);

    // evidence_files are the distinct accepted paths (§6).
    const [row] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(row!.evidenceFiles?.slice().sort()).toEqual(['src/repo-intel.ts', 'src/run-executor.ts']);

    // The link is visible through the agents module immediately (AC-42) …
    const links = await (await makeApp()).inject({
      method: 'GET',
      url: `/agents/${agent!.id}/skills`,
    });
    expect(links.json().map((l: { skill_id: string }) => l.skill_id)).toContain(skill.id);

    // … and the skill is in the Skills grid with the link counted (AC-52).
    const grid = await (await makeApp()).inject({ method: 'GET', url: '/skills' });
    const listed = grid.json().find((s: { id: string }) => s.id === skill.id);
    expect(listed).toBeDefined();
    expect(listed.source).toBe('extracted');
    expect(listed.agent_count).toBe(1);
  });

  it('re-creating the same extracted skill bumps its version instead of forking it', async () => {
    const repoId = await newRepo('skill-rerun');
    const scan = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    const first = (scan.json().candidates as { id: string }[])[0]!;
    await (await makeApp()).inject({
      method: 'PUT',
      url: `/conventions/${first.id}`,
      payload: { status: 'accepted' },
    });
    const draft = (
      await (await makeApp()).inject({ method: 'GET', url: `/repos/${repoId}/conventions/draft` })
    ).json();

    const created = (
      await (await makeApp()).inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill`,
        payload: { name: draft.name, body: draft.body, type: draft.type },
      })
    ).json();

    const again = (
      await (await makeApp()).inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill`,
        payload: { name: draft.name, body: `${draft.body}\n\n<!-- second run -->`, type: draft.type },
      })
    ).json();

    expect(again.id).toBe(created.id);
    expect(again.version).toBe(created.version + 1);

    // ONE `repo-conventions` per workspace, never a `repo-conventions-2`. Note
    // the rule is workspace-scoped, not repo-scoped (spec §6): a second repo
    // scanned in the same workspace updates this very skill.
    const named = await pg.handle.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, DEFAULT_SKILL_NAME)));
    expect(named).toHaveLength(1);

    // Append-only history: every version up to the newest is still readable, and
    // the body this test wrote first was not overwritten in place.
    const versions = await pg.handle.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, created.id));
    expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual(
      Array.from({ length: again.version }, (_, i) => i + 1),
    );
    expect(versions.find((v) => v.version === created.version)!.body).toBe(created.body);
    expect(versions.find((v) => v.version === again.version)!.body).toBe(again.body);
  });

  // ---- AC-53 through the real Settings route -------------------------------

  it('changing the conventions model in Settings changes the next scan report (AC-53)', async () => {
    const repoId = await newRepo('model-switch');
    const NEXT_MODEL = 'it-conventions-model-v2';

    const put = await (await makeApp()).inject({
      method: 'PUT',
      url: '/settings',
      payload: {
        feature_models: {
          [CONVENTIONS_FEATURE]: { provider: feature.defaultProvider, model: NEXT_MODEL },
        },
      },
    });
    expect(put.statusCode).toBe(200);

    const scan = await (await makeApp()).inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(scan.json().model).toBe(NEXT_MODEL);

    // Put it back so the suite's order stays irrelevant.
    await (await makeApp()).inject({
      method: 'PUT',
      url: '/settings',
      payload: {
        feature_models: {
          [CONVENTIONS_FEATURE]: { provider: feature.defaultProvider, model: CHOSEN_MODEL },
        },
      },
    });
  });

  // ---- Workspace scoping ---------------------------------------------------

  it('a repo in another workspace is a 404, never a 403', async () => {
    const [other] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: 'other-tenant' })
      .returning();
    const [foreign] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId: other!.id,
        owner: 'acme',
        name: 'foreign',
        fullName: 'acme/foreign',
        defaultBranch: 'main',
      })
      .returning();

    const app = await makeApp();
    for (const url of [
      `/repos/${foreign!.id}/conventions`,
      `/repos/${foreign!.id}/conventions/draft`,
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'POST', url: `/repos/${foreign!.id}/conventions/extract` }))
        .statusCode,
    ).toBe(404);
  });
});
