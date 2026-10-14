import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confinePath, isPathEscape } from './confine-path.js';
import { SimpleGitClient } from './simple-git.js';

/** S-AC-9: a path escaping the clone is rejected — absolute, `..`, symlink. */
describe('confinePath / SimpleGitClient.readFile (S-AC-9)', () => {
  let base: string;
  let root: string;
  let outside: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'confine-'));
    root = join(base, 'clone');
    outside = join(base, 'outside');
    await mkdir(join(root, 'docs', 'deep'), { recursive: true });
    await mkdir(outside);
    await writeFile(join(root, 'docs', 'deep', 'plan.md'), 'inside');
    await writeFile(join(outside, 'secret.md'), 'TOP SECRET');
    await symlink(outside, join(root, 'link-dir'));
    await symlink(join(outside, 'secret.md'), join(root, 'link-file.md'));
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('S-AC-9: a valid nested path resolves to its real path inside the root', async () => {
    const p = await confinePath(root, 'docs/deep/plan.md');
    expect(p).toBe(join(await realpath(root), 'docs', 'deep', 'plan.md'));
  });

  it('S-AC-9: rejects an absolute path', async () => {
    await expect(confinePath(root, join(outside, 'secret.md'))).rejects.toThrow();
  });

  it('S-AC-9: rejects `..` segments', async () => {
    await expect(confinePath(root, '../outside/secret.md')).rejects.toThrow();
    await expect(confinePath(root, 'docs/../../outside/secret.md')).rejects.toThrow();
  });

  it('S-AC-9: rejects a symlinked file or directory that leaves the root', async () => {
    await expect(confinePath(root, 'link-file.md')).rejects.toThrow(/escapes/);
    await expect(confinePath(root, 'link-dir/secret.md')).rejects.toThrow(/escapes/);
  });

  it('S-AC-9: SimpleGitClient.readFile reads inside the clone and rejects an escape', async () => {
    const client = new SimpleGitClient(base);
    // clonePathFor(repo) → <base>/<owner>/<name>; lay a clone out at that spot.
    const repo = { owner: 'o', name: 'n' };
    const cloneRoot = client.clonePathFor(repo);
    await mkdir(join(cloneRoot, 'docs'), { recursive: true });
    await writeFile(join(cloneRoot, 'docs', 'a.md'), 'hello');
    await writeFile(join(base, 'o', 'leak.md'), 'LEAK');
    await symlink(join(outside, 'secret.md'), join(cloneRoot, 'evil.md'));

    expect(await client.readFile(repo, 'docs/a.md')).toBe('hello');
    await expect(client.readFile(repo, '../leak.md')).rejects.toThrow();
    await expect(client.readFile(repo, '/etc/passwd')).rejects.toThrow();
    await expect(client.readFile(repo, 'evil.md')).rejects.toThrow();
  });

  it('rejects escapes with a PathEscapeError, and a missing file with something else', async () => {
    const caught = async (rel: string) => confinePath(root, rel).catch((e: unknown) => e);
    expect(isPathEscape(await caught(join(outside, 'secret.md')))).toBe(true);
    expect(isPathEscape(await caught('../outside/secret.md'))).toBe(true);
    expect(isPathEscape(await caught('link-file.md'))).toBe(true);
    const missing = await caught('docs/nope.md');
    expect(missing).toBeInstanceOf(Error);
    expect(isPathEscape(missing)).toBe(false);
  });
});
