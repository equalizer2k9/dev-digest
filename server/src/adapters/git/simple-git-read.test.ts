import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SimpleGitClient } from './simple-git.js';
import { isFileTooLarge } from '../file-too-large.js';

/**
 * S-AC-9(b): the size cap is applied BEFORE the read, and readFileAtRef refuses a
 * non-hex ref or an escaping path. Runs against a real temporary git repo.
 */
describe('SimpleGitClient size cap and ref/path guards (S-AC-9)', () => {
  let base: string;
  let client: SimpleGitClient;
  const repo = { owner: 'o', name: 'n' };
  let sha: string;

  beforeAll(async () => {
    base = await mkdtemp(join(tmpdir(), 'sg-read-'));
    client = new SimpleGitClient(base);
    const root = client.clonePathFor(repo);
    await mkdir(join(root, 'docs'), { recursive: true });
    await writeFile(join(root, 'docs', 'small.md'), 'tiny');
    await writeFile(join(root, 'docs', 'big.md'), 'x'.repeat(5000));
    const git = (...a: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], {
        cwd: root,
        encoding: 'utf8',
      });
    git('init', '-q');
    git('add', '.');
    git('commit', '-q', '-m', 'init');
    sha = git('rev-parse', 'HEAD').trim();
  });
  afterAll(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('S-AC-9: readFile rejects an oversized file with a FileTooLarge error, and reads a small one', async () => {
    const err = await client.readFile(repo, 'docs/big.md', 1000).catch((e) => e);
    expect(isFileTooLarge(err)).toBe(true);
    expect(await client.readFile(repo, 'docs/small.md', 1000)).toBe('tiny');
    expect((await client.readFile(repo, 'docs/big.md', 10_000)).length).toBe(5000);
  });

  it('S-AC-9: readFileAtRef rejects an oversized file with a FileTooLarge error, and reads a small one', async () => {
    const err = await client.readFileAtRef(repo, sha, 'docs/big.md', 1000).catch((e) => e);
    expect(isFileTooLarge(err)).toBe(true);
    expect(await client.readFileAtRef(repo, sha, 'docs/small.md', 1000)).toBe('tiny');
  });

  it('S-AC-9: readFileAtRef rejects a non-hex ref', async () => {
    for (const ref of ['HEAD', 'main', '--output=/tmp/x', `${sha};id`, 'zzzzzzz']) {
      await expect(client.readFileAtRef(repo, ref, 'docs/small.md', 1000), ref).rejects.toThrow();
    }
  });

  it('S-AC-9: readFileAtRef rejects a path with `..` or a leading `/`', async () => {
    for (const p of ['../x.md', 'docs/../../x.md', '/etc/passwd']) {
      await expect(client.readFileAtRef(repo, sha, p, 1000), p).rejects.toThrow();
    }
  });
});
