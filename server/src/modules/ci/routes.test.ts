import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { MockAuthProvider } from '../../adapters/mocks.js';
import { loadConfig } from '../../platform/config.js';
import { AppError } from '../../platform/errors.js';

const svc = vi.hoisted(() => ({
  installations: vi.fn(),
  preview: vi.fn(),
  install: vi.fn(),
  listRuns: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('./service.js', () => ({
  CiService: class {
    installations = svc.installations;
    preview = svc.preview;
    install = svc.install;
    listRuns = svc.listRuns;
    refresh = svc.refresh;
  },
}));

const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const AGENT = '11111111-1111-4111-8111-111111111111';
const REPO = '22222222-2222-4222-8222-222222222222';
const body = { repo_id: REPO, triggers: ['opened'], post_as: 'github_review' };

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
});
afterAll(async () => {
  await app.close();
});
beforeEach(() => {
  for (const f of Object.values(svc)) f.mockReset();
});

describe('ci routes (no DB)', () => {
  it('AC-3: a 409 from the service reaches the client with its message', async () => {
    svc.preview.mockRejectedValue(new AppError('ci_runner_missing', 'build it: pnpm --dir agent-runner build', 409));
    const res = await app.inject({ method: 'POST', url: `/agents/${AGENT}/ci/preview`, payload: body });
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).toContain('pnpm --dir agent-runner build');
    expect(JSON.stringify(res.json())).toContain('ci_runner_missing');
  });

  it('AC-8: a 403 from install reaches the client', async () => {
    svc.install.mockRejectedValue(new AppError('ci_workflow_permission', 'needs workflow scope', 403));
    const res = await app.inject({ method: 'POST', url: `/agents/${AGENT}/ci/install`, payload: body });
    expect(res.statusCode).toBe(403);
    expect(JSON.stringify(res.json())).toContain('ci_workflow_permission');
  });

  it('install passes workspace, agent and body to the service', async () => {
    const out = {
      installation: { id: 'i', agent_id: AGENT, repo: 'a/b', target_type: 'gha', installed_at: 'x' },
      pr_url: 'https://github.com/a/b/pull/1',
      reused_pr: false,
      paths: ['p'],
    };
    svc.install.mockResolvedValue(out);
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/ci/install`,
      payload: { ...body, workflow: 'name: x' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(out);
    expect(svc.install).toHaveBeenCalledWith('w1', AGENT, { ...body, workflow: 'name: x' });
  });

  it('422 on empty triggers and on a bad agent_id', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/ci/preview`,
      payload: { ...body, triggers: [] },
    });
    expect(r1.statusCode).toBe(422);
    const r2 = await app.inject({ method: 'GET', url: '/ci/runs?agent_id=not-a-uuid' });
    expect(r2.statusCode).toBe(422);
    expect(svc.preview).not.toHaveBeenCalled();
    expect(svc.listRuns).not.toHaveBeenCalled();
  });

  it('AC-12: GET /ci/runs?agent_id forwards the filter', async () => {
    svc.listRuns.mockResolvedValue({ runs: [] });
    const res = await app.inject({ method: 'GET', url: `/ci/runs?agent_id=${AGENT}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ runs: [] });
    expect(svc.listRuns).toHaveBeenCalledWith('w1', AGENT);
  });

  it('GET /agents/:id/ci/installations', async () => {
    svc.installations.mockResolvedValue([]);
    const res = await app.inject({ method: 'GET', url: `/agents/${AGENT}/ci/installations` });
    expect(res.statusCode).toBe(200);
    expect(svc.installations).toHaveBeenCalledWith('w1', AGENT);
  });

  it('AC-11: POST /ci/runs/refresh returns 200 with the error text', async () => {
    svc.refresh.mockResolvedValue({ runs: [], error: 'GitHub down', ingested: 0, skipped: 0 });
    const res = await app.inject({ method: 'POST', url: '/ci/runs/refresh' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ runs: [], error: 'GitHub down', ingested: 0, skipped: 0 });
    expect(svc.refresh).toHaveBeenCalledWith('w1', expect.objectContaining({ info: expect.any(Function), warn: expect.any(Function) }));
  });
});
