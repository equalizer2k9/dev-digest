import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from './simple-git.js';

const all = (p: string) => p.endsWith('.md');

describe('SimpleGitClient.listFiles', () => {
  let base: string;
  let client: SimpleGitClient;
  const repo = { owner: 'o', name: 'n' };
  const opts = { accept: all, skipDirs: ['node_modules'], limit: 100, maxEntries: 1000 };

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'list-files-'));
    client = new SimpleGitClient(base);
    const root = client.clonePathFor(repo);
    await mkdir(join(root, 'docs', 'b'), { recursive: true });
    await mkdir(join(root, 'docs', 'a'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await mkdir(join(base, 'outside'));
    await writeFile(join(root, 'z.md'), 'z');
    await writeFile(join(root, 'docs', 'b', 'two.md'), '2');
    await writeFile(join(root, 'docs', 'a', 'one.md'), '1');
    await writeFile(join(root, 'docs', 'top.md'), 't');
    await writeFile(join(root, 'node_modules', 'pkg', 'skip.md'), 's');
    await writeFile(join(base, 'outside', 'secret.md'), 'secret');
    await writeFile(join(base, 'outside', 'deep.md'), 'deep');
    await symlink(join(base, 'outside'), join(root, 'link-dir'));
    await symlink(join(base, 'outside', 'secret.md'), join(root, 'link-out.md'));
    await symlink(join(root, 'z.md'), join(root, 'link-in.md'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('returns paths in segment order, skipping skipDirs and symlinked directories', async () => {
    const { paths, truncated } = await client.listFiles(repo, opts);
    expect(truncated).toBe(false);
    expect(paths).toEqual(['docs/a/one.md', 'docs/b/two.md', 'docs/top.md', 'link-in.md', 'z.md']);
  });

  it('lists a symlinked file only when it points inside the root', async () => {
    const { paths } = await client.listFiles(repo, opts);
    expect(paths).toContain('link-in.md');
    expect(paths).not.toContain('link-out.md');
    expect(paths.some((p) => p.startsWith('link-dir'))).toBe(false);
  });

  it('truncates at the limit', async () => {
    const r = await client.listFiles(repo, { ...opts, limit: 2 });
    expect(r.paths).toEqual(['docs/a/one.md', 'docs/b/two.md']);
    expect(r.truncated).toBe(true);
  });

  it('is not truncated when matches equal the limit', async () => {
    const r = await client.listFiles(repo, { ...opts, limit: 5 });
    expect(r.paths).toHaveLength(5);
    expect(r.truncated).toBe(false);
  });

  it('truncates when maxEntries is reached', async () => {
    const r = await client.listFiles(repo, { ...opts, maxEntries: 3 });
    expect(r.truncated).toBe(true);
  });

  it('rejects an ENOENT-coded error for a missing root', async () => {
    await expect(client.listFiles({ owner: 'o', name: 'gone' }, opts)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});

/** Security: a committed symlink must not smuggle .git/config, secrets or non-documents into a read. */
describe('symlinks resolving to a non-document inside the clone', () => {
  let base: string;
  let client: SimpleGitClient;
  const repo = { owner: 'o', name: 'sec' };
  // Feature rule: the REAL relative path must itself be a document.
  const accept = (p: string) =>
    p.endsWith('.md') && !p.split('/').some((s) => s === '.git' || s === 'node_modules') && /(^|\/)docs\//.test(p);

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'list-sec-'));
    client = new SimpleGitClient(base);
    const root = client.clonePathFor(repo);
    await mkdir(join(root, '.git'), { recursive: true });
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, '.git', 'config'), 'url = https://x-access-token:TOKEN@github.com/o/r');
    await writeFile(join(root, '.env'), 'SECRET=1');
    await writeFile(join(root, 'docs', 'ok.md'), 'fine');
    await symlink(join(root, '.git', 'config'), join(root, 'docs', 'x.md'));
    await symlink(join(root, '.env'), join(root, 'docs', 'env.md'));
    await symlink(join(root, 'docs', 'ok.md'), join(root, 'docs', 'link-ok.md'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('listFiles lists only symlinks whose real path is itself a document', async () => {
    const { paths } = await client.listFiles(repo, { accept, skipDirs: ['.git'], limit: 100, maxEntries: 1000 });
    expect(paths).toEqual(['docs/link-ok.md', 'docs/ok.md']);
  });

  it('readFile with an accept rule refuses them and still reads the good ones', async () => {
    await expect(client.readFile(repo, 'docs/x.md', undefined, accept)).rejects.toMatchObject({ code: 'PATH_ESCAPE' });
    await expect(client.readFile(repo, 'docs/env.md', undefined, accept)).rejects.toMatchObject({ code: 'PATH_ESCAPE' });
    expect(await client.readFile(repo, 'docs/link-ok.md', undefined, accept)).toBe('fine');
  });
});
