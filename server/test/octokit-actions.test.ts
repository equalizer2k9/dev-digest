import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hand-rolled Octokit stub: one impl per method name, no network.
const stub = vi.hoisted(() => ({
  impls: {} as Record<string, (a: any) => Promise<unknown>>,
  calls: [] as { name: string; args: unknown }[],
}));
const m = (name: string) => (a: unknown) => {
  stub.calls.push({ name, args: a });
  const impl = stub.impls[name];
  if (!impl) throw new Error(`no stub for ${name}`);
  return impl(a);
};

vi.mock('octokit', () => ({
  Octokit: class {
    rest = {
      actions: {
        listWorkflowRuns: m('listWorkflowRuns'),
        listWorkflowRunArtifacts: m('listWorkflowRunArtifacts'),
        downloadArtifact: m('downloadArtifact'),
      },
      git: {
        getRef: m('getRef'),
        getCommit: m('getCommit'),
        createTree: m('createTree'),
        createCommit: m('createCommit'),
        createRef: m('createRef'),
        updateRef: m('updateRef'),
      },
    };
  },
}));

import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import { isWorkflowPermission } from '../src/adapters/github/errors.js';

const repo = { owner: 'acme', name: 'api' } as never;
const fail = (status: number, message: string) => async () => {
  throw Object.assign(new Error(message), { status });
};
const client = () => new OctokitGitHubClient('t');

beforeEach(() => {
  stub.impls = {};
  stub.calls.length = 0;
});

describe('listWorkflowRuns', () => {
  it('maps a run, and an empty pull_requests gives pr_number null', async () => {
    stub.impls.listWorkflowRuns = async () => ({
      data: {
        workflow_runs: [
          {
            id: 5,
            html_url: 'https://github.com/acme/api/actions/runs/5',
            conclusion: 'success',
            pull_requests: [{ number: 7 }],
            head_repository: { full_name: 'acme/api' },
            updated_at: '2026-10-01T00:00:00Z',
          },
          {
            id: 6,
            html_url: 'u6',
            conclusion: null,
            pull_requests: [],
            head_repository: null,
            updated_at: '2026-10-02T00:00:00Z',
          },
        ],
      },
    });
    const runs = await client().listWorkflowRuns(repo, 'devdigest-review.yml', 30);
    expect(runs[0]).toEqual({
      id: 5,
      html_url: 'https://github.com/acme/api/actions/runs/5',
      conclusion: 'success',
      pr_number: 7,
      head_repo: 'acme/api',
      completed_at: '2026-10-01T00:00:00Z',
    });
    expect(runs[1]).toMatchObject({ pr_number: null, head_repo: null });
    expect(stub.calls[0]!.args).toMatchObject({
      owner: 'acme',
      repo: 'api',
      workflow_id: 'devdigest-review.yml',
      status: 'completed',
      per_page: 30,
    });
  });

  it('404 gives []; 500 rejects', async () => {
    stub.impls.listWorkflowRuns = fail(404, 'Not Found');
    expect(await client().listWorkflowRuns(repo, 'w.yml', 30)).toEqual([]);
    stub.impls.listWorkflowRuns = fail(500, 'boom');
    await expect(client().listWorkflowRuns(repo, 'w.yml', 30)).rejects.toThrow('boom');
  });
});

describe('downloadArtifact', () => {
  it('no artifact -> missing', async () => {
    stub.impls.listWorkflowRunArtifacts = async () => ({ data: { artifacts: [] } });
    expect(await client().downloadArtifact(repo, 5, 'devdigest-result')).toEqual({ kind: 'missing' });
  });
  it('expired -> expired', async () => {
    stub.impls.listWorkflowRunArtifacts = async () => ({
      data: { artifacts: [{ id: 9, expired: true }] },
    });
    expect(await client().downloadArtifact(repo, 5, 'x')).toEqual({ kind: 'expired' });
  });
  it('returns the bytes', async () => {
    stub.impls.listWorkflowRunArtifacts = async () => ({
      data: { artifacts: [{ id: 9, expired: false }] },
    });
    stub.impls.downloadArtifact = async () => ({ data: new Uint8Array([1, 2, 3]).buffer });
    const out = await client().downloadArtifact(repo, 5, 'x');
    expect(out.kind).toBe('ok');
    if (out.kind === 'ok') expect(Array.from(out.zip)).toEqual([1, 2, 3]);
    expect(stub.calls.at(-1)!.args).toMatchObject({ artifact_id: 9, archive_format: 'zip' });
  });
});

describe('commitFiles permission mapping', () => {
  const payload = { branch: 'devdigest/ci', base: 'main', message: 'm', files: [{ path: 'a', contents: 'b' }] };
  const happy = () => {
    stub.impls.getRef = async () => ({ data: { object: { sha: 'p' } } });
    stub.impls.getCommit = async () => ({ data: { tree: { sha: 't' } } });
    stub.impls.createTree = async () => ({ data: { sha: 'tr' } });
    stub.impls.createCommit = async () => ({ data: { sha: 'c' } });
  };
  it('403 from updateRef -> permission error', async () => {
    happy();
    stub.impls.updateRef = fail(403, 'Resource not accessible by personal access token');
    const err = await client().commitFiles(repo, payload).catch((e) => e);
    expect(isWorkflowPermission(err)).toBe(true);
  });
  it('403 from createRef (new branch) -> permission error', async () => {
    happy();
    let first = true;
    stub.impls.getRef = async (a: any) => {
      if (first && a.ref === 'heads/devdigest/ci') {
        first = false;
        throw Object.assign(new Error('Not Found'), { status: 404 });
      }
      return { data: { object: { sha: 'p' } } };
    };
    stub.impls.createRef = fail(403, 'nope');
    const err = await client().commitFiles(repo, payload).catch((e) => e);
    expect(isWorkflowPermission(err)).toBe(true);
  });
  it('422 mentioning workflow -> permission error', async () => {
    happy();
    stub.impls.createTree = fail(422, 'refusing to allow an OAuth App to create or update workflow `x` without `workflow` scope');
    const err = await client().commitFiles(repo, payload).catch((e) => e);
    expect(isWorkflowPermission(err)).toBe(true);
  });
  it('404 on first getRef still falls back to base', async () => {
    happy();
    const refs: string[] = [];
    stub.impls.getRef = async (a: any) => {
      refs.push(a.ref);
      if (a.ref === 'heads/devdigest/ci') throw Object.assign(new Error('Not Found'), { status: 404 });
      return { data: { object: { sha: 'p' } } };
    };
    stub.impls.createRef = async () => ({});
    expect(await client().commitFiles(repo, payload)).toEqual({ branch: 'devdigest/ci' });
    expect(refs).toEqual(['heads/devdigest/ci', 'heads/main']);
  });
});
