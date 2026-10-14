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
