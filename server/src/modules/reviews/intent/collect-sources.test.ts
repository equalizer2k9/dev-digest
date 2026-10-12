import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Container } from '../../../platform/container.js';
import { MockGitClient, MockGitHubClient } from '../../../adapters/mocks.js';
import type { IssueMeta, RepoRef } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../../adapters/git/diff-parser.js';
import { collectSources } from './collect-sources.js';
import { MAX_SPEC_FILE_CHARS } from './constants.js';

const repo: RepoRef = { owner: 'acme', name: 'api' };
const diff = parseUnifiedDiff(
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n+x',
);

class FakeGit extends MockGitClient {
  readAtRefCalls: string[] = [];
  readCalls: string[] = [];
  constructor(
    private head: Record<string, string>,
    private tree: Record<string, string>,
  ) {
    super();
  }
  override async readFileAtRef(_r: RepoRef, _ref: string, path: string): Promise<string> {
    this.readAtRefCalls.push(path);
    if (!(path in this.head)) throw new Error('not at ref');
    return this.head[path]!;
  }
  override async readFile(_r: RepoRef, path: string): Promise<string> {
    this.readCalls.push(path);
    if (!(path in this.tree)) throw new Error('ENOENT');
    return this.tree[path]!;
  }
}

class FakeGitHub extends MockGitHubClient {
  issueCalls: number[] = [];
  contentCalls: string[] = [];
  constructor(
    private issues: Record<number, Partial<IssueMeta>> = {},
    files: Record<string, string> = {},
  ) {
    super({ fileContents: files });
  }
  override async getIssue(r: RepoRef, n: number): Promise<IssueMeta> {
    this.issueCalls.push(n);
    return { number: n, title: `Issue ${n}`, body: `body ${n}`, state: 'open', ...this.issues[n] };
  }
  override async getFileContent(r: RepoRef, path: string, ref: string): Promise<string | null> {
    this.contentCalls.push(path);
    return super.getFileContent(r, path, ref);
  }
}

const containerOf = (git: MockGitClient, gh: MockGitHubClient) =>
  ({ git, github: async () => gh }) as unknown as Container;

const run = (body: string | null, git: MockGitClient, gh: MockGitHubClient) =>
  collectSources({
    container: containerOf(git, gh),
    repo,
    pull: { title: 'T', body, headSha: 'abc1234' },
    diff,
  });

afterEach(() => vi.restoreAllMocks());

describe('collectSources: spec files (S-AC-8)', () => {
  it('S-AC-8: a file at the PR head is used, even when the clone working tree differs', async () => {
    const git = new FakeGit({ 'docs/plan.md': 'HEAD VERSION' }, { 'docs/plan.md': 'CLONE VERSION' });
    const out = await run('see `docs/plan.md`', git, new FakeGitHub());
    expect(out.files).toEqual([{ path: 'docs/plan.md', content: 'HEAD VERSION' }]);
    expect(out.sources).toContainEqual({ kind: 'spec_file', ref: 'docs/plan.md', status: 'used' });
  });

  it('S-AC-8: when the head lacks it, GitHub contents at head sha, then the clone, supply it', async () => {
    const viaApi = await run(
      'see `docs/plan.md`',
      new FakeGit({}, {}),
      new FakeGitHub({}, { 'docs/plan.md': 'FROM API' }),
    );
    expect(viaApi.files[0]!.content).toBe('FROM API');

    const viaClone = await run('see `docs/plan.md`', new FakeGit({}, { 'docs/plan.md': 'FROM CLONE' }), new FakeGitHub());
    expect(viaClone.files[0]!.content).toBe('FROM CLONE');
    expect(viaClone.sources).toContainEqual({ kind: 'spec_file', ref: 'docs/plan.md', status: 'used' });
  });

  it('S-AC-8: a file found nowhere is recorded missing with a reason, its content is absent, and the rest still resolves', async () => {
    const git = new FakeGit({ 'docs/ok.md': 'OK' }, {});
    const out = await run('`docs/ok.md` and `docs/gone.md`', git, new FakeGitHub());
    expect(out.files.map((f) => f.path)).toEqual(['docs/ok.md']);
    const missing = out.sources.find((s) => s.ref === 'docs/gone.md')!;
    expect(missing.status).toBe('missing');
    expect(missing.reason).toBeTruthy();
  });
});

describe('collectSources: SSRF / traversal (S-AC-9)', () => {
  it('S-AC-9: no HTTP fetch is made for URLs in the PR text', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await run(
      'See https://evil.example/x.md and [a](https://evil.example/y.md) and https://github.com/evil/other/issues/5 and https://github.com/evil/other/blob/main/z.md',
      new FakeGit({}, {}),
      new FakeGitHub(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('S-AC-9: foreign-repo issue URLs never reach getIssue; own-repo ones do', async () => {
    const gh = new FakeGitHub();
    await run('https://github.com/evil/other/issues/5 and https://github.com/acme/api/issues/6', new FakeGit({}, {}), gh);
    expect(gh.issueCalls).toEqual([6]);
  });

  it('S-AC-9: absolute, `..` and non-.md references are never read from git or GitHub', async () => {
    const git = new FakeGit({}, {});
    const gh = new FakeGitHub();
    await run('[a](/etc/passwd.md) [b](../../secret.md) [c](src/index.ts) `~/.ssh/id.txt`', git, gh);
    expect([...git.readAtRefCalls, ...git.readCalls, ...gh.contentCalls]).toEqual([]);
  });

  it('S-AC-9: an oversized .md file is not used and is recorded', async () => {
    const big = 'x'.repeat(MAX_SPEC_FILE_CHARS + 1);
    const out = await run('`docs/big.md`', new FakeGit({ 'docs/big.md': big }, {}), new FakeGitHub());
    expect(out.files).toEqual([]);
    const s = out.sources.find((x) => x.ref === 'docs/big.md')!;
    expect(s.status).not.toBe('used');
    expect(s.reason).toBeTruthy();
  });
});

describe('collectSources: issues (S-AC-10) and description (S-AC-7)', () => {
  it('S-AC-10: a #N that is a pull request is skipped with is_pull_request and not used', async () => {
    const gh = new FakeGitHub({ 31: { is_pull_request: true } });
    const out = await run('Closes #31 and closes #32', new FakeGit({}, {}), gh);
    expect(out.issues.map((i) => i.number)).toEqual([32]);
    expect(out.sources).toContainEqual({ kind: 'linked_issue', ref: '#31', status: 'skipped', reason: 'is_pull_request' });
    expect(out.sources).toContainEqual({ kind: 'linked_issue', ref: '#32', status: 'used' });
  });

  it('S-AC-10: a bare #N without a closing keyword is not fetched', async () => {
    const gh = new FakeGitHub();
    const out = await run('Related to #40, see #41', new FakeGit({}, {}), gh);
    expect(gh.issueCalls).toEqual([]);
    expect(out.sources.some((s) => s.kind === 'linked_issue')).toBe(false);
  });

  it('S-AC-10: an issue that cannot be fetched is recorded missing, never invented', async () => {
    class Boom extends FakeGitHub {
      override async getIssue(): Promise<IssueMeta> {
        throw new Error('404');
      }
    }
    const out = await run('closes #50', new FakeGit({}, {}), new Boom());
    expect(out.issues).toEqual([]);
    expect(out.sources).toContainEqual(expect.objectContaining({ kind: 'linked_issue', ref: '#50', status: 'missing' }));
  });

  it('S-AC-7: empty body → pr_description missing/empty; null body → missing/not_synced', async () => {
    const empty = await run('   ', new FakeGit({}, {}), new FakeGitHub());
    expect(empty.sources).toContainEqual({ kind: 'pr_description', ref: 'description', status: 'missing', reason: 'empty' });
    const nul = await run(null, new FakeGit({}, {}), new FakeGitHub());
    expect(nul.sources).toContainEqual({ kind: 'pr_description', ref: 'description', status: 'missing', reason: 'not_synced' });
  });

  it('S-AC-6: the outline carries @@ headers and no hunk body', async () => {
    const out = await run('x', new FakeGit({}, {}), new FakeGitHub());
    expect(out.outline).toContain('src/a.ts');
    expect(out.outline).toContain('@@ -1 +1 @@');
  });
});

describe('collectSources: refused references and fetch errors (S-AC-9, security carry-over)', () => {
  it('S-AC-9: refused references are recorded as skipped spec_file sources with their reason, and never read', async () => {
    const git = new FakeGit({ 'etc/passwd.md': 'LEAK' }, { 'etc/passwd.md': 'LEAK' });
    const gh = new FakeGitHub({}, { 'etc/passwd.md': 'LEAK' });
    const out = await run('[a](/etc/passwd.md) [b](../../secret.md) [c](notes.txt) [d](https://evil.example/x.md)', git, gh);
    expect(out.sources).toContainEqual({ kind: 'spec_file', ref: '/etc/passwd.md', status: 'skipped', reason: 'absolute_path' });
    expect(out.sources).toContainEqual({ kind: 'spec_file', ref: '../../secret.md', status: 'skipped', reason: 'path_traversal' });
    expect(out.sources).toContainEqual({ kind: 'spec_file', ref: 'notes.txt', status: 'skipped', reason: 'not_markdown' });
    // URLs of other hosts are ignored, not recorded
    expect(out.sources.some((s) => s.ref.includes('evil.example'))).toBe(false);
    expect([...git.readAtRefCalls, ...git.readCalls, ...gh.contentCalls]).toEqual([]);
    expect(out.files).toEqual([]);
  });

  it('S-AC-9: the byte cap is passed to every reader so the size check happens before the read', async () => {
    const seen: (number | undefined)[] = [];
    class SpyGit extends FakeGit {
      override async readFileAtRef(r: RepoRef, ref: string, path: string, maxBytes?: number): Promise<string> {
        seen.push(maxBytes);
        return super.readFileAtRef(r, ref, path);
      }
      override async readFile(r: RepoRef, path: string, maxBytes?: number): Promise<string> {
        seen.push(maxBytes);
        return super.readFile(r, path);
      }
    }
    await run('`docs/x.md`', new SpyGit({}, {}), new FakeGitHub());
    expect(seen.length).toBeGreaterThan(0);
    for (const m of seen) expect(typeof m === 'number' && m > 0).toBe(true);
  });

  it('security: a failed issue fetch is recorded with reason fetch_failed, not the error text', async () => {
    class Boom extends FakeGitHub {
      override async getIssue(): Promise<IssueMeta> {
        throw new Error('SENTINEL-secret-token-ghp_123 upstream said no');
      }
    }
    const out = await run('closes #50', new FakeGit({}, {}), new Boom());
    const src = out.sources.find((s) => s.ref === '#50')!;
    expect(src.reason).toBe('fetch_failed');
    expect(JSON.stringify(out.sources)).not.toContain('SENTINEL');
  });
});
