import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowRunInfo, ArtifactDownload } from '@devdigest/shared';
import { MockGitHubClient } from '../../adapters/mocks.js';
import { GitHubWorkflowPermissionError } from '../../adapters/github/errors.js';
import type { Container } from '../../platform/container.js';
import { AppError, ConfigError, NotFoundError } from '../../platform/errors.js';
import { ARTIFACT_FILE } from './constants.js';
import type { CiRepository, CiRunValues } from './repository.js';
import { CiService } from './service.js';

const WS = 'w1';
const AGENT_ID = '11111111-1111-4111-8111-111111111111';
const REPO_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'ghp_SECRETTOKEN123';

const agent = {
  id: AGENT_ID,
  workspaceId: WS,
  name: 'Reviewer',
  provider: 'openrouter',
  model: 'm/x',
  systemPrompt: 'be nice',
  strategy: 'auto',
  ciFailOn: 'critical',
};
const links = [
  { skill: { name: 'A', body: 'A BODY', enabled: true }, order: 0 },
  { skill: { name: 'B', body: 'B BODY', enabled: false }, order: 1 },
];

const dirs: string[] = [];
const runnerDir = (withIndex = true) => {
  const d = mkdtempSync(path.join(tmpdir(), 'ci-svc-'));
  dirs.push(d);
  if (withIndex) writeFileSync(path.join(d, 'index.js'), 'main');
  writeFileSync(path.join(d, 'package.json'), '{}');
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const instRow = (agentId = AGENT_ID) => ({
  id: 'i1',
  agentId,
  repo: 'acme/api',
  targetType: 'gha' as const,
  installedAt: new Date('2026-10-01T00:00:00Z'),
});

function fakeRepo(over: Record<string, unknown> = {}) {
  const calls = { upsert: [] as unknown[][], recorded: [] as CiRunValues[], listRuns: [] as unknown[][], ingestedQueries: [] as string[][] };
  const repo = {
    repoById: vi.fn(async (_ws: string, id: string) =>
      id === REPO_ID ? { id, owner: 'acme', name: 'api', fullName: 'acme/api' } : undefined,
    ),
    installationsForAgent: vi.fn(async () => [instRow()]),
    installationForRepo: vi.fn(async () => undefined as ReturnType<typeof instRow> | undefined),
    ghaInstallations: vi.fn(async () => [
      { installationId: 'i1', agentId: AGENT_ID, agentName: 'Reviewer', provider: 'openrouter', model: 'm/x', repo: 'acme/api' },
    ]),
    upsertInstallation: vi.fn(async (...a: unknown[]) => {
      calls.upsert.push(a);
      return { kind: 'ok' as const, row: instRow() };
    }),
    ingestedUrls: vi.fn(async (_ws: string, urls: string[]) => {
      calls.ingestedQueries.push(urls);
      return new Set<string>();
    }),
    prIdFor: vi.fn(async () => 'pr-1' as string | null),
    recordCiRun: vi.fn(async (_ws: string, v: CiRunValues) => {
      calls.recorded.push(v);
      return true;
    }),
    listRuns: vi.fn(async (...a: unknown[]) => {
      calls.listRuns.push(a);
      return [] as never[];
    }),
    ...over,
  };
  return { repo, calls };
}

function setup(opts: { gh?: MockGitHubClient; repoOver?: Record<string, unknown>; dir?: string; githubReject?: Error } = {}) {
  const gh = opts.gh ?? new MockGitHubClient();
  const github = vi.fn(async () => {
    if (opts.githubReject) throw opts.githubReject;
    return gh;
  });
  const agentsRepo = {
    getById: vi.fn(async (ws: string, id: string) => (ws === WS && id === AGENT_ID ? agent : undefined)),
    linkedSkills: vi.fn(async () => links),
  };
  const container = { agentsRepo, github, db: {} } as unknown as Container;
  const { repo, calls } = fakeRepo(opts.repoOver);
  const service = new CiService(container, {
    repo: repo as unknown as CiRepository,
    runnerDir: opts.dir ?? runnerDir(),
  });
  return { service, gh, github, repo, calls };
}

const input = { repo_id: REPO_ID, triggers: ['opened', 'synchronize'] as ('opened' | 'synchronize')[], post_as: 'github_review' as const };

describe('preview / install failures', () => {
  it('AC-3: no runner build -> 409 with the build hint, GitHub untouched', async () => {
    const dir = path.join(tmpdir(), 'does-not-exist-ci');
    const { service, github, gh } = setup({ dir });
    for (const call of [() => service.preview(WS, AGENT_ID, input), () => service.install(WS, AGENT_ID, input)]) {
      const err = await call().catch((e) => e);
      expect(err).toBeInstanceOf(AppError);
      expect(err).toMatchObject({ statusCode: 409, code: 'ci_runner_missing' });
      expect(err.message).toContain('pnpm --dir agent-runner build');
    }
    expect(github).not.toHaveBeenCalled();
    expect(gh.committed).toEqual([]);
    expect(gh.openedPrs).toEqual([]);
  });

  it('AC-2: empty model -> 422 ci_manifest_invalid, nothing committed', async () => {
    const { service, gh } = setup();
    // agentsRepo returns the shared agent; override model
    (service as unknown as { container: { agentsRepo: { getById: unknown } } }).container.agentsRepo.getById = async () => ({
      ...agent,
      model: '',
    });
    const err = await service.install(WS, AGENT_ID, input).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 422, code: 'ci_manifest_invalid' });
    expect(gh.committed).toEqual([]);
  });

  it('NFR-6: foreign agent or repo -> NotFoundError', async () => {
    const { service } = setup();
    await expect(service.preview('other', AGENT_ID, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.install(WS, AGENT_ID, { ...input, repo_id: '33333333-3333-4333-8333-333333333333' })).rejects.toBeInstanceOf(NotFoundError);
    await expect(service.installations('other', AGENT_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('EC-12: another agent holds the repo -> 409 ci_repo_taken, nothing committed', async () => {
    const { service, gh } = setup({
      repoOver: { installationForRepo: vi.fn(async () => instRow('99999999-9999-4999-8999-999999999999')) },
    });
    const err = await service.install(WS, AGENT_ID, input).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 409, code: 'ci_repo_taken' });
    expect(gh.committed).toEqual([]);
  });

  it('EC-16: github() rejecting with ConfigError is rethrown, nothing recorded', async () => {
    const { service, calls } = setup({ githubReject: new ConfigError('GITHUB_TOKEN is not configured') });
    await expect(service.install(WS, AGENT_ID, input)).rejects.toBeInstanceOf(ConfigError);
    expect(calls.upsert).toEqual([]);
  });

  it('AC-8: workflow permission error -> 403 naming the scope; no installation', async () => {
    const gh = new MockGitHubClient({ commitError: new GitHubWorkflowPermissionError('refused') });
    const { service, calls } = setup({ gh });
    const err = await service.install(WS, AGENT_ID, input).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 403, code: 'ci_workflow_permission' });
    expect(err.message).toContain('workflow');
    expect(err.message).toContain('Workflows: write');
    expect(calls.upsert).toEqual([]);
  });
});

describe('preview and install', () => {
  it('preview returns the bundle and never resolves github()', async () => {
    const { service, github } = setup();
    const out = await service.preview(WS, AGENT_ID, input);
    expect(out.files.map((f) => f.path)).toEqual([
      '.devdigest/agents/reviewer.yaml',
      '.devdigest/skills/a.md',
      '.devdigest/runner/index.js',
      '.devdigest/runner/package.json',
      '.github/workflows/devdigest-review.yml',
    ]);
    expect(github).not.toHaveBeenCalled();
  });

  it('AC-6: first install commits to devdigest/ci, opens one PR, upserts once', async () => {
    const { service, gh, calls } = setup();
    const preview = await service.preview(WS, AGENT_ID, input);
    const out = await service.install(WS, AGENT_ID, input);
    expect(gh.committed).toHaveLength(1);
    expect(gh.committed[0]).toMatchObject({ branch: 'devdigest/ci', base: 'main', message: 'Add DevDigest CI review' });
    expect(gh.committed[0]!.files.map((f) => f.path)).toEqual(preview.files.map((f) => f.path));
    expect(gh.openedPrs).toHaveLength(1);
    expect(gh.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: 'devdigest/ci', base: 'main' });
    for (const f of preview.files) expect(gh.openedPrs[0]!.body).toContain(f.path);
    expect(gh.openedPrs[0]!.body).toContain('OPENROUTER_API_KEY');
    expect(out).toMatchObject({ pr_url: 'https://github.com/mock/mock/pull/1', reused_pr: false });
    expect(out.paths).toEqual(preview.files.map((f) => f.path));
    expect(out.installation).toMatchObject({ id: 'i1', agent_id: AGENT_ID, repo: 'acme/api', target_type: 'gha' });
    expect(calls.upsert).toEqual([[WS, AGENT_ID, 'acme/api']]);
    expect(gh.posted).toEqual([]);
  });

  it('AC-7: second install reuses the PR', async () => {
    const { service, gh, calls } = setup();
    const a = await service.install(WS, AGENT_ID, input);
    const b = await service.install(WS, AGENT_ID, input);
    expect(gh.openedPrs).toHaveLength(1);
    expect(gh.committed).toHaveLength(2);
    expect(b.pr_url).toBe(a.pr_url);
    expect(b.reused_pr).toBe(true);
    expect(calls.upsert).toHaveLength(2);
    expect(calls.upsert[1]).toEqual(calls.upsert[0]);
  });

  it('A-5: an edited workflow is committed unchanged; other files regenerated', async () => {
    const { service, gh } = setup();
    const edited = 'name: mine\n';
    await service.install(WS, AGENT_ID, { ...input, workflow: edited });
    const files = gh.committed[0]!.files;
    expect(files.find((f) => f.path === '.github/workflows/devdigest-review.yml')!.contents).toBe(edited);
    expect(files.find((f) => f.path === '.devdigest/skills/a.md')!.contents).toBe('A BODY');
  });
});

describe('refresh', () => {
  const URL1 = 'https://github.com/acme/api/actions/runs/1';
  const wfRun = (id: number, over: Partial<WorkflowRunInfo> = {}): WorkflowRunInfo => ({
    id,
    html_url: `https://github.com/acme/api/actions/runs/${id}`,
    conclusion: 'success',
    pr_number: 7,
    head_repo: 'acme/api',
    completed_at: '2026-10-01T00:00:00Z',
    ...over,
  });
  const art = (over: Record<string, unknown> = {}): ArtifactDownload => ({
    kind: 'ok',
    zip: zipSync({
      [ARTIFACT_FILE]: strToU8(
        JSON.stringify({ findings_count: 2, cost_usd: 0.5, duration_ms: 3000, agent: 'Reviewer', pr_number: 7, ...over }),
      ),
    }),
  });
  const log = () => ({ info: vi.fn(), warn: vi.fn() });

  it('AC-9: records the valid run once, with mapped values; limit 30', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1), wfRun(2)], artifacts: { 1: art() } });
    const spy = vi.spyOn(gh, 'listWorkflowRuns');
    const { service, calls } = setup({ gh });
    const out = await service.refresh(WS, log());
    expect(spy).toHaveBeenCalledWith({ owner: 'acme', name: 'api' }, 'devdigest-review.yml', 30);
    expect(calls.recorded).toHaveLength(1);
    expect(calls.recorded[0]).toMatchObject({
      githubUrl: URL1,
      agentId: AGENT_ID,
      installationId: 'i1',
      prNumber: 7,
      prId: 'pr-1',
      status: 'succeeded',
      findingsCount: 2,
      costUsd: 0.5,
      durationMs: 3000,
      ranAt: new Date('2026-10-01T00:00:00Z'),
    });
    expect(out).toMatchObject({ error: null, ingested: 1, skipped: 1 });
  });

  it('EC-9: PR not imported -> prId null', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1)], artifacts: { 1: art() } });
    const { service, calls } = setup({ gh, repoOver: { prIdFor: vi.fn(async () => null) } });
    await service.refresh(WS, log());
    expect(calls.recorded[0]!.prId).toBeNull();
  });

  it('already-ingested URL is neither downloaded nor recorded', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1)], artifacts: { 1: art() } });
    const { service, calls } = setup({ gh, repoOver: { ingestedUrls: vi.fn(async () => new Set([URL1])) } });
    await service.refresh(WS, log());
    expect(gh.downloads).toEqual([]);
    expect(calls.recorded).toEqual([]);
  });

  it('AC-10: each bad run is skipped with exactly one {runUrl, reason} warn; the valid one is still recorded', async () => {
    const runs = [wfRun(1), wfRun(2), wfRun(3), wfRun(4), wfRun(5), wfRun(6), wfRun(7, { pr_number: null }), wfRun(8)];
    const gh = new MockGitHubClient({
      workflowRuns: runs,
      artifacts: {
        2: { kind: 'expired' },
        3: { kind: 'ok', zip: new Uint8Array([1, 2, 3]) },
        4: { kind: 'ok', zip: zipSync({ [ARTIFACT_FILE]: strToU8('nope') }) },
        5: art({ pr_number: 99 }),
        6: art({ agent: 'Other' }),
        7: art(),
        8: art(),
      },
    });
    const { service, calls } = setup({ gh });
    const l = log();
    const out = await service.refresh(WS, l);
    expect(l.warn).toHaveBeenCalledTimes(7);
    const reasons = l.warn.mock.calls.map((c) => (c[0] as { reason: string }).reason);
    expect(reasons).toEqual(['missing', 'expired', 'bad_archive', 'invalid_result', 'pr_mismatch', 'agent_mismatch', 'no_pull_request']);
    for (const c of l.warn.mock.calls) expect(Object.keys(c[0] as object).sort()).toEqual(['reason', 'runUrl']);
    expect(calls.recorded.map((r) => r.githubUrl)).toEqual(['https://github.com/acme/api/actions/runs/8']);
    expect(out.skipped).toBe(7);
  });

  it('AC-9 / D15: foreign or unknown head repo is skipped without a download', async () => {
    const gh = new MockGitHubClient({
      workflowRuns: [
        wfRun(1, { head_repo: 'evil/api' }),
        wfRun(2, { head_repo: null }),
        wfRun(3, { head_repo: 'ACME/Api' }),
      ],
      artifacts: { 1: art(), 2: art(), 3: art() },
    });
    const { service, calls } = setup({ gh });
    const l = log();
    const out = await service.refresh(WS, l);
    expect(gh.downloads.map((d) => d.runId)).toEqual([3]);
    const reasons = l.warn.mock.calls.map((c) => (c[0] as { reason: string }).reason);
    expect(reasons).toEqual(['foreign_head_repo', 'foreign_head_repo']);
    expect(calls.recorded.map((r) => r.githubUrl)).toEqual(['https://github.com/acme/api/actions/runs/3']);
    expect(out).toMatchObject({ error: null, ingested: 1, skipped: 2 });
  });

  it('AC-10: a too_large artifact is skipped', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1)], artifacts: { 1: { kind: 'too_large' } } });
    const { service, calls } = setup({ gh });
    const l = log();
    const out = await service.refresh(WS, l);
    expect((l.warn.mock.calls[0]![0] as { reason: string }).reason).toBe('too_large');
    expect(calls.recorded).toEqual([]);
    expect(out.skipped).toBe(1);
  });

  it('a recordCiRun failure skips only that run; the next is recorded and error stays null', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1), wfRun(2)], artifacts: { 1: art(), 2: art() } });
    const recorded: CiRunValues[] = [];
    let n = 0;
    const recordCiRun = vi.fn(async (_ws: string, v: CiRunValues) => {
      if (n++ === 0) throw new Error('db down');
      recorded.push(v);
      return true;
    });
    const { service } = setup({ gh, repoOver: { recordCiRun } });
    const l = log();
    const out = await service.refresh(WS, l);
    expect(out).toMatchObject({ error: null, ingested: 1, skipped: 1 });
    expect(recorded.map((r) => r.githubUrl)).toEqual(['https://github.com/acme/api/actions/runs/2']);
    expect(l.warn.mock.calls).toHaveLength(1);
    expect(l.warn.mock.calls[0]![0]).toEqual({
      runUrl: 'https://github.com/acme/api/actions/runs/1',
      reason: 'record_failed',
    });
  });

  it('S-2: logs carry no token and no artifact body', async () => {
    const gh = new MockGitHubClient({ workflowRuns: [wfRun(1)], artifacts: { 1: art({ agent: TOKEN, pr_number: 9 }) } });
    const { service } = setup({ gh });
    const l = log();
    await service.refresh(WS, l);
    const dump = JSON.stringify([l.info.mock.calls, l.warn.mock.calls]);
    expect(dump).not.toContain(TOKEN);
    expect(dump).not.toContain('findings_count');
  });

  it('AC-11: listing error -> runs from listRuns plus a non-null error; later installations continue', async () => {
    const gh = new MockGitHubClient({ listRunsError: new Error('GitHub down') });
    const { service, calls } = setup({ gh });
    const out = await service.refresh(WS, log());
    expect(out.error).toContain('GitHub down');
    expect(out.runs).toEqual([]);
    expect(calls.listRuns).toHaveLength(1);

    const gh2 = new MockGitHubClient({ workflowRuns: [wfRun(1)], artifacts: { 1: art() } });
    const orig = gh2.downloadArtifact.bind(gh2);
    let first = true;
    gh2.downloadArtifact = async (r, id, n) => {
      if (first) {
        first = false;
        throw new Error('dl failed');
      }
      return orig(r, id, n);
    };
    const two = [
      { installationId: 'i1', agentId: AGENT_ID, agentName: 'Reviewer', provider: 'openrouter', model: 'm/x', repo: 'acme/api' },
      { installationId: 'i2', agentId: AGENT_ID, agentName: 'Reviewer', provider: 'openrouter', model: 'm/x', repo: 'acme/api' },
    ];
    const s2 = setup({ gh: gh2, repoOver: { ghaInstallations: vi.fn(async () => two) } });
    const out2 = await s2.service.refresh(WS, log());
    expect(out2.error).toContain('dl failed');
    expect(s2.calls.recorded).toHaveLength(1);
  });

  it('EC-17: no runs -> nothing recorded, error null', async () => {
    const { service, calls } = setup();
    const out = await service.refresh(WS, log());
    expect(out).toMatchObject({ error: null, ingested: 0, skipped: 0 });
    expect(calls.recorded).toEqual([]);
  });

  it('zero installations -> github() not called', async () => {
    const { service, github } = setup({ repoOver: { ghaInstallations: vi.fn(async () => []) } });
    await service.refresh(WS, log());
    expect(github).not.toHaveBeenCalled();
  });

  it('EC-16: missing token with installations rethrows ConfigError', async () => {
    const { service } = setup({ githubReject: new ConfigError('no token') });
    await expect(service.refresh(WS, log())).rejects.toBeInstanceOf(ConfigError);
  });
});

describe('listRuns (AC-12)', () => {
  it('forwards agentId, maps rows and sorts newest first', async () => {
    const row = (id: string, ranAt: Date | null) => ({
      id, installationRepo: 'acme/api', prNumber: 1, agentId: AGENT_ID, agentName: 'Reviewer', status: 'succeeded',
      findingsCount: 1, costUsd: null, durationMs: 2000, ranAt, githubUrl: null,
    });
    const { service } = setup({
      repoOver: { listRuns: vi.fn(async (...a: unknown[]) => { calls2.push(a); return [row('old', new Date('2026-01-01')), row('new', new Date('2026-05-01'))]; }) },
    });
    const calls2: unknown[][] = [];
    const out = await service.listRuns(WS, AGENT_ID);
    expect(calls2).toEqual([[WS, AGENT_ID]]);
    expect(out.runs.map((r) => r.id)).toEqual(['new', 'old']);
    expect(out.runs[0]!.duration_s).toBe(2);
  });
});
