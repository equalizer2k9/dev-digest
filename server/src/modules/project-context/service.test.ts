import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoRef } from '@devdigest/shared';
import { MockGitClient } from '../../adapters/mocks.js';
import { FileTooLargeError } from '../../adapters/file-too-large.js';
import { PathEscapeError } from '../../adapters/git/confine-path.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { ProjectContextService } from './service.js';

/**
 * Unit coverage for the project-context service: MOCKED repository and a
 * strict fake git (a bare MockGitClient answers a missing path with '', which
 * would look like an empty, included document).
 */

const repo = vi.hoisted(() => ({
  repo: vi.fn(),
  skill: vi.fn(),
  paths: vi.fn(),
  pathsForSkills: vi.fn(),
  setPaths: vi.fn(),
  usage: vi.fn(),
}));
vi.mock('./repository.js', () => ({ ProjectContextRepository: vi.fn(() => repo) }));

const WS = 'ws-1';
const REPO = { id: 'r1', workspaceId: WS, owner: 'acme', name: 'web', clonePath: '/clones/acme/web' };

const enoent = () => Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' });

/** Reads throw like the real client; `listFiles` is scripted. */
class StrictGit extends MockGitClient {
  files: Record<string, string | Error> = {};
  listing: { paths: string[]; truncated: boolean } | Error = { paths: [], truncated: false };
  readCalls: string[] = [];
  listCalls: unknown[] = [];
  atRefCalls = 0;
  async readFile(_r: RepoRef, path: string, maxBytes?: number): Promise<string> {
    this.readCalls.push(path);
    const v = this.files[path];
    if (v === undefined) throw enoent();
    if (v instanceof Error) throw v;
    if (maxBytes !== undefined && Buffer.byteLength(v) > maxBytes) {
      throw new FileTooLargeError(path, Buffer.byteLength(v), maxBytes);
    }
    return v;
  }
  async readFileAtRef(): Promise<string> {
    this.atRefCalls++;
    throw new Error('readFileAtRef must not be used');
  }
  async listFiles(_r: RepoRef, opts: unknown) {
    this.listCalls.push(opts);
    if (this.listing instanceof Error) throw this.listing;
    return this.listing;
  }
}

let git: StrictGit;
let count: (t: string) => number;
const agentsRepo = { getById: vi.fn(), linkedSkills: vi.fn() };

function make() {
  const container = {
    db: {},
    git,
    tokenizer: { count: (t: string) => count(t) },
    agentsRepo,
  } as unknown as Container;
  return new ProjectContextService(container);
}

beforeEach(() => {
  vi.clearAllMocks();
  git = new StrictGit();
  count = (t) => t.length;
  repo.repo.mockResolvedValue(REPO);
  repo.usage.mockResolvedValue([]);
});

describe('list', () => {
  it('AC-1: returns accepted paths in listFiles order with their tag, and passes limit 500', async () => {
    git.listing = { paths: ['docs/b.md', 'specs/a.md', 'pkg/insights/x.md'], truncated: false };
    git.files = { 'docs/b.md': 'bb', 'specs/a.md': 'a', 'pkg/insights/x.md': 'xxx' };
    const out = await make().list(WS, 'r1');
    expect(out.has_clone).toBe(true);
    expect(out.documents.map((d) => [d.path, d.tag])).toEqual([
      ['docs/b.md', 'docs'],
      ['specs/a.md', 'specs'],
      ['pkg/insights/x.md', 'insights'],
    ]);
    const opts = git.listCalls[0] as { limit: number; accept(p: string): boolean; skipDirs: string[] };
    expect(opts.limit).toBe(500);
    expect(opts.skipDirs).toEqual(['.git', 'node_modules']);
    expect(opts.accept('docs/a.md')).toBe(true);
    expect(opts.accept('src/a.md')).toBe(false);
  });

  it('EC-15: a truncated listing is reported', async () => {
    git.listing = { paths: ['docs/a.md'], truncated: true };
    git.files = { 'docs/a.md': 'a' };
    expect((await make().list(WS, 'r1')).truncated).toBe(true);
  });

  it('AC-5/EC-14: tokens come from the counter; a too-large document is not counted', async () => {
    count = vi.fn((t: string) => t.length * 2);
    git.listing = { paths: ['docs/a.md', 'docs/big.md', 'docs/gone.md'], truncated: false };
    git.files = { 'docs/a.md': 'abcd', 'docs/big.md': 'x'.repeat(20_001) };
    const out = await make().list(WS, 'r1');
    expect(out.documents[0]).toMatchObject({ tokens: 8, too_large: false });
    expect(out.documents[1]).toMatchObject({ tokens: null, too_large: true });
    expect(out.documents[2]).toMatchObject({ tokens: null, too_large: false });
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('AC-3: used_by counts agents (enabled or not) reaching the path, not through a disabled skill', async () => {
    git.listing = { paths: ['docs/a.md'], truncated: false };
    git.files = { 'docs/a.md': 'a' };
    repo.usage.mockResolvedValue([
      { id: 'a1', name: 'a1', enabled: true, own: ['docs/a.md'], skills: [] },
      {
        id: 'a2',
        name: 'a2',
        enabled: false,
        own: [],
        skills: [{ id: 's1', name: 's1', enabled: true, paths: ['docs/a.md'] }],
      },
      {
        id: 'a3',
        name: 'a3',
        enabled: true,
        own: [],
        skills: [{ id: 's2', name: 's2', enabled: false, paths: ['docs/a.md'] }],
      },
    ]);
    expect((await make().list(WS, 'r1')).documents[0]!.used_by).toBe(2);
  });

  it('AC-33: no clone path, or a missing clone directory, gives has_clone false', async () => {
    repo.repo.mockResolvedValue({ ...REPO, clonePath: null });
    expect(await make().list(WS, 'r1')).toEqual({ has_clone: false, documents: [], truncated: false });
    expect(git.listCalls).toHaveLength(0);

    repo.repo.mockResolvedValue(REPO);
    git.listing = enoent();
    expect(await make().list(WS, 'r1')).toEqual({ has_clone: false, documents: [], truncated: false });
  });

  it('AC-15: an unknown repository is NotFound and git is not touched', async () => {
    repo.repo.mockResolvedValue(undefined);
    await expect(make().list(WS, 'nope')).rejects.toBeInstanceOf(NotFoundError);
    await expect(make().preview(WS, 'nope', 'docs/a.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(git.listCalls).toHaveLength(0);
    expect(git.readCalls).toHaveLength(0);
  });
});

describe('preview', () => {
  it('returns the text', async () => {
    git.files = { 'docs/a.md': 'hello' };
    expect(await make().preview(WS, 'r1', 'docs/a.md')).toEqual({ path: 'docs/a.md', content: 'hello' });
  });

  it('AC-4/AC-23: not a document, absent and escaping all answer NotFound', async () => {
    git.files = { 'docs/esc.md': new PathEscapeError('docs/esc.md') };
    await expect(make().preview(WS, 'r1', 'src/a.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(make().preview(WS, 'r1', 'docs/gone.md')).rejects.toBeInstanceOf(NotFoundError);
    await expect(make().preview(WS, 'r1', 'docs/esc.md')).rejects.toBeInstanceOf(NotFoundError);
    expect(git.readCalls).toEqual(['docs/gone.md', 'docs/esc.md']);
  });

  it('too large is 413, any other failure is 422, with fixed messages', async () => {
    git.files = {
      'docs/big.md': 'x'.repeat(20_001),
      'docs/denied.md': Object.assign(new Error('EACCES: /secret/clone/docs/denied.md'), { code: 'EACCES' }),
    };
    await expect(make().preview(WS, 'r1', 'docs/big.md')).rejects.toMatchObject({
      statusCode: 413,
      code: 'context_document_too_large',
    });
    const err = await make().preview(WS, 'r1', 'docs/denied.md').catch((e: unknown) => e);
    expect(err).toMatchObject({ statusCode: 422, code: 'context_document_unreadable' });
    expect(String((err as Error).message)).not.toContain('secret');
  });
});

describe('read outcomes (AC-22, AC-23)', () => {
  const reasonFor = async (path: string, files: Record<string, string | Error>) => {
    git.files = files;
    const out = await make().readOutcome(REPO as never, path);
    return out.ok ? 'ok' : out.reason;
  };

  it('maps every outcome to its reason', async () => {
    expect(await reasonFor('docs/a.md', {})).toBe('missing');
    expect(await reasonFor('docs/a.md', { 'docs/a.md': new PathEscapeError('x') })).toBe('outside_clone');
    expect(await reasonFor('docs/a.md', { 'docs/a.md': new FileTooLargeError('x', 9, 1) })).toBe('too_large');
    expect(await reasonFor('docs/a.md', { 'docs/a.md': 'x'.repeat(20_001) })).toBe('too_large');
    expect(await reasonFor('docs/a.md', { 'docs/a.md': new Error('boom') })).toBe('unreadable');
    expect(await reasonFor('docs/a.md', { 'docs/a.md': 'fine' })).toBe('ok');
  });

  it('a stored path ../x.md is outside_clone and readFile is not called', async () => {
    expect(await reasonFor('../x.md', {})).toBe('outside_clone');
    expect(git.readCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------- T-6

const AGENT = { id: 'ag1', workspaceId: WS, name: 'Agent' };
const asRow = (id: string, name: string, enabled = true) => ({ skill: { id, name, enabled }, order: 0 });

beforeEach(() => {
  agentsRepo.getById.mockResolvedValue(AGENT);
  agentsRepo.linkedSkills.mockResolvedValue([]);
  repo.paths.mockResolvedValue([]);
  repo.pathsForSkills.mockResolvedValue(new Map());
  repo.setPaths.mockResolvedValue(undefined);
  repo.skill.mockResolvedValue({ id: 'sk1', name: 'Skill' });
});

const agent = { kind: 'agent', id: 'ag1' } as const;
const skillOwner = { kind: 'skill', id: 'sk1' } as const;


describe('setAttachments', () => {
  const put = (paths: string[], owner: typeof agent | typeof skillOwner = agent) =>
    make().setAttachments(WS, owner, { repo_id: 'r1', paths });

  it('AC-8/AC-12: stores the given order, replaces on a second call, stores only paths', async () => {
    git.files = { 'docs/a.md': 'a', 'docs/b.md': 'b' };
    await put(['docs/b.md', 'docs/a.md']);
    expect(repo.setPaths).toHaveBeenLastCalledWith(agent, 'r1', ['docs/b.md', 'docs/a.md']);
    repo.paths.mockResolvedValue(['docs/b.md', 'docs/a.md']);
    await put(['docs/a.md']);
    expect(repo.setPaths).toHaveBeenLastCalledWith(agent, 'r1', ['docs/a.md']);
    await put(['docs/a.md'], skillOwner);
    expect(repo.setPaths).toHaveBeenLastCalledWith(skillOwner, 'r1', ['docs/a.md']);
  });

  it.each([
    ['absolute', '/docs/a.md'],
    ['climbing', 'docs/../a.md'],
    ['control char', 'docs/a\n.md'],
    ['not md', 'docs/a.txt'],
    ['outside roots', 'src/a.md'],
    ['absent from the clone', 'docs/gone.md'],
  ])('AC-14: a new %s path is refused with context_path_invalid and nothing is stored', async (_n, path) => {
    git.files = { 'docs/ok.md': 'x' };
    const err = await put(['docs/ok.md', path]).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'context_path_invalid', statusCode: 422 });
    expect(String((err as Error).message)).not.toContain(path);
    expect(repo.setPaths).not.toHaveBeenCalled();
  });

  it('a new too-large document is accepted', async () => {
    git.files = { 'docs/big.md': 'x'.repeat(20_001) };
    await put(['docs/big.md']);
    expect(repo.setPaths).toHaveBeenCalled();
  });

  it('D-5/EC-5: an already stored path that is now missing is kept', async () => {
    repo.paths.mockResolvedValue(['docs/gone.md', 'docs/a.md']);
    git.files = { 'docs/a.md': 'a' };
    await put(['docs/gone.md']);
    expect(repo.setPaths).toHaveBeenCalledWith(agent, 'r1', ['docs/gone.md']);
  });

  it('AC-15: an unknown owner or repository is NotFound and nothing is stored', async () => {
    agentsRepo.getById.mockResolvedValue(undefined);
    await expect(put(['docs/a.md'])).rejects.toBeInstanceOf(NotFoundError);
    repo.skill.mockResolvedValue(undefined);
    await expect(put(['docs/a.md'], skillOwner)).rejects.toBeInstanceOf(NotFoundError);
    agentsRepo.getById.mockResolvedValue(AGENT);
    repo.repo.mockResolvedValue(undefined);
    await expect(put(['docs/a.md'])).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.setPaths).not.toHaveBeenCalled();
  });
});

describe('getAttachments', () => {
  it('AC-10/AC-11/EC-5: own paths, skill-only paths carry the skill, tokens on every readable one', async () => {
    repo.paths.mockImplementation(async (o: { kind: string }) => (o.kind === 'agent' ? ['docs/a.md', 'docs/gone.md'] : []));
    agentsRepo.linkedSkills.mockResolvedValue([asRow('s1', 'House'), asRow('s2', 'Off', false)]);
    repo.pathsForSkills.mockResolvedValue(new Map([['s1', ['docs/b.md']], ['s2', ['docs/c.md']]]));
    git.files = { 'docs/a.md': 'aaa', 'docs/b.md': 'bb', 'docs/c.md': 'c' };
    const out = await make().getAttachments(WS, agent, 'r1');
    expect(out.attached).toEqual(['docs/a.md', 'docs/gone.md']);
    expect(out.effective).toEqual([
      { path: 'docs/a.md', tokens: 3, skip_reason: null, skill: null },
      { path: 'docs/gone.md', tokens: null, skip_reason: 'missing', skill: null },
      { path: 'docs/b.md', tokens: 2, skip_reason: null, skill: { id: 's1', name: 'House' } },
    ]);
  });

  it('a skill: its own list only, skill null', async () => {
    repo.paths.mockResolvedValue(['docs/a.md']);
    git.files = { 'docs/a.md': 'aaa' };
    const out = await make().getAttachments(WS, skillOwner, 'r1');
    expect(out.effective).toEqual([{ path: 'docs/a.md', tokens: 3, skip_reason: null, skill: null }]);
  });

  it('AC-11/EC-9: documents after the budget are over_budget but still carry tokens', async () => {
    repo.paths.mockResolvedValue(['docs/a.md', 'docs/b.md', 'docs/c.md']);
    git.files = { 'docs/a.md': 'a'.repeat(5000), 'docs/b.md': 'b'.repeat(4000), 'docs/c.md': 'c'.repeat(10) };
    const out = await make().getAttachments(WS, agent, 'r1');
    expect(out.effective.map((e) => [e.skip_reason, e.tokens])).toEqual([
      [null, 5000],
      ['over_budget', 4000],
      ['over_budget', 10],
    ]);
  });
});

describe('forRun', () => {
  const run = () => make().forRun('ag1', REPO as never);

  it('AC-24/AC-25: first included, second and third over_budget, third never read', async () => {
    repo.paths.mockResolvedValue(['docs/a.md', 'docs/b.md', 'docs/c.md']);
    git.files = { 'docs/a.md': 'a'.repeat(5000), 'docs/b.md': 'b'.repeat(4000), 'docs/c.md': 'c'.repeat(10) };
    const out = await run();
    expect(out.entries).toEqual([
      { path: 'docs/a.md', tokens: 5000, skip_reason: null },
      { path: 'docs/b.md', tokens: null, skip_reason: 'over_budget' },
      { path: 'docs/c.md', tokens: null, skip_reason: 'over_budget' },
    ]);
    expect(out.documents.map((d) => d.path)).toEqual(['docs/a.md']);
    expect(git.readCalls).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('D-8: texts summing to exactly 8000 -> the second is over_budget; the rendered section fits', async () => {
    repo.paths.mockResolvedValue(['docs/a.md', 'docs/b.md']);
    git.files = { 'docs/a.md': 'a'.repeat(4000), 'docs/b.md': 'b'.repeat(4000) };
    const out = await run();
    expect(out.entries.map((e) => e.skip_reason)).toEqual([null, 'over_budget']);
    expect(out.entries[0]!.tokens).toBe(4000);
    const { PROJECT_CONTEXT_HEADING, renderProjectDocument } = await import('@devdigest/reviewer-core');
    const section = PROJECT_CONTEXT_HEADING + out.documents.map(renderProjectDocument).join('\n\n');
    expect(section.length).toBeLessThanOrEqual(8000);
  });

  it('AC-22: a missing, unreadable, escaping and too-large document are recorded, later ones still included', async () => {
    repo.paths.mockResolvedValue(['docs/m.md', 'docs/u.md', 'docs/e.md', 'docs/t.md', 'docs/ok.md']);
    git.files = {
      'docs/u.md': new Error('boom'),
      'docs/e.md': new PathEscapeError('docs/e.md'),
      'docs/t.md': 'x'.repeat(20_001),
      'docs/ok.md': 'fine',
    };
    const out = await run();
    expect(out.entries).toEqual([
      { path: 'docs/m.md', tokens: null, skip_reason: 'missing' },
      { path: 'docs/u.md', tokens: null, skip_reason: 'unreadable' },
      { path: 'docs/e.md', tokens: null, skip_reason: 'outside_clone' },
      { path: 'docs/t.md', tokens: null, skip_reason: 'too_large' },
      { path: 'docs/ok.md', tokens: 4, skip_reason: null },
    ]);
    expect(out.documents).toEqual([{ path: 'docs/ok.md', content: 'fine' }]);
  });

  it('EC-13: a whitespace-only document is included with 0 tokens and gives no documents item', async () => {
    repo.paths.mockResolvedValue(['docs/blank.md']);
    git.files = { 'docs/blank.md': '  \n ' };
    const out = await run();
    expect(out.entries).toEqual([{ path: 'docs/blank.md', tokens: 0, skip_reason: null }]);
    expect(out.documents).toEqual([]);
  });

  it('AC-17: never reads at a ref; effective order includes enabled skills', async () => {
    repo.paths.mockResolvedValue(['docs/a.md']);
    agentsRepo.linkedSkills.mockResolvedValue([asRow('s1', 'House')]);
    repo.pathsForSkills.mockResolvedValue(new Map([['s1', ['docs/b.md']]]));
    git.files = { 'docs/a.md': 'a', 'docs/b.md': 'b' };
    const out = await run();
    expect(out.documents.map((d) => d.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(git.atRefCalls).toBe(0);
  });
});

describe('forBrief', () => {
  const agentUsage = (id: string, name: string, enabled: boolean, own: string[]) => ({
    id,
    name,
    enabled,
    own,
    skills: [],
  });

  it('AC-29: enabled agents in name order, a shared path once, the disabled one absent', async () => {
    repo.usage.mockResolvedValue([
      agentUsage('a', 'a', true, ['docs/a.md', 'docs/shared.md']),
      agentUsage('b', 'b', true, ['docs/shared.md', 'docs/b.md']),
      agentUsage('c', 'c', false, ['docs/c.md']),
    ]);
    git.files = { 'docs/a.md': 'A', 'docs/b.md': 'B', 'docs/c.md': 'C', 'docs/shared.md': 'S' };
    const out = await make().forBrief(WS, 'r1', 1000);
    expect(out.documents.map((d) => d.path)).toEqual(['docs/a.md', 'docs/shared.md', 'docs/b.md']);
    expect(out.skipped).toEqual([]);
  });

  it('stops reading once maxChars is passed', async () => {
    repo.usage.mockResolvedValue([agentUsage('a', 'a', true, ['docs/a.md', 'docs/b.md', 'docs/c.md'])]);
    git.files = { 'docs/a.md': 'x'.repeat(60), 'docs/b.md': 'y'.repeat(60), 'docs/c.md': 'z'.repeat(60) };
    const out = await make().forBrief(WS, 'r1', 100);
    expect(out.documents.map((d) => d.path)).toEqual(['docs/a.md', 'docs/b.md']);
    expect(git.readCalls).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('SPEC-01 AC-34: unreadable ones come back in skipped with their reason; the next readable one is kept', async () => {
    repo.usage.mockResolvedValue([
      agentUsage('a', 'a', true, ['docs/m.md', 'docs/u.md', 'docs/e.md', 'docs/t.md', 'docs/ok.md']),
    ]);
    git.files = {
      'docs/u.md': new Error('boom'),
      'docs/e.md': new PathEscapeError('x'),
      'docs/t.md': 'x'.repeat(20_001),
      'docs/ok.md': 'fine',
    };
    const out = await make().forBrief(WS, 'r1', 10_000);
    expect(out.skipped).toEqual([
      { path: 'docs/m.md', reason: 'missing' },
      { path: 'docs/u.md', reason: 'unreadable' },
      { path: 'docs/e.md', reason: 'outside_clone' },
      { path: 'docs/t.md', reason: 'too_large' },
    ]);
    expect(out.documents).toEqual([{ path: 'docs/ok.md', content: 'fine' }]);
  });

  it('an unknown repository is NotFound', async () => {
    repo.repo.mockResolvedValue(undefined);
    await expect(make().forBrief(WS, 'nope', 10)).rejects.toBeInstanceOf(NotFoundError);
  });
});
