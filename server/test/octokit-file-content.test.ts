import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hand-rolled stub of the one Octokit method under test: no network, no vi.fn rejection tracking.
const stub = vi.hoisted(() => ({
  impl: (async () => undefined) as (a: unknown) => Promise<unknown>,
  calls: [] as unknown[],
}));

vi.mock('octokit', () => ({
  Octokit: class {
    rest = {
      repos: {
        getContent: (a: unknown) => {
          stub.calls.push(a);
          return stub.impl(a);
        },
      },
    };
  },
}));

import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';
import { isFileTooLarge } from '../src/adapters/file-too-large.js';

const repo = { owner: 'acme', name: 'api' } as never;
const file = (text: string, size = Buffer.byteLength(text)) => ({
  data: { type: 'file', size, content: Buffer.from(text, 'utf8').toString('base64'), encoding: 'base64' },
});
const respond = (v: unknown) => {
  stub.impl = async () => v;
};
const fail = (status: number, message: string) => {
  stub.impl = async () => {
    throw Object.assign(new Error(message), { status });
  };
};

describe('OctokitGitHubClient.getFileContent (S-AC-9)', () => {
  beforeEach(() => {
    stub.calls.length = 0;
  });

  it('S-AC-9: a file whose size exceeds maxBytes is rejected with the file-too-large error and not returned', async () => {
    respond(file('hello world', 5000));
    const err = await new OctokitGitHubClient('t').getFileContent(repo, 'docs/big.md', 'abc', 1000).then(
      (v) => ({ resolved: v }),
      (e) => e,
    );
    expect(isFileTooLarge(err)).toBe(true);
    expect(err).not.toHaveProperty('resolved');
  });

  it('S-AC-9: a file within the cap returns its decoded text (boundary: size === maxBytes)', async () => {
    const text = 'héllo ✓';
    respond(file(text));
    expect(await new OctokitGitHubClient('t').getFileContent(repo, 'a.md', 'abc', Buffer.byteLength(text))).toBe(text);
  });

  it('S-AC-9: a 404 returns null', async () => {
    fail(404, 'Not Found');
    expect(await new OctokitGitHubClient('t').getFileContent(repo, 'missing.md', 'abc', 1000)).toBeNull();
  });

  it('S-AC-9: a directory listing returns null', async () => {
    respond({ data: [{ type: 'file', name: 'a.md' }] });
    expect(await new OctokitGitHubClient('t').getFileContent(repo, 'docs', 'abc', 1000)).toBeNull();
  });

  it('S-AC-9: a symlink returns null', async () => {
    respond({ data: { type: 'symlink', size: 10, target: '../../etc/passwd' } });
    expect(await new OctokitGitHubClient('t').getFileContent(repo, 'link.md', 'abc', 1000)).toBeNull();
  });

  it('S-AC-9: the request targets only the given owner, repo, path and ref', async () => {
    respond(file('x'));
    await new OctokitGitHubClient('t').getFileContent(repo, 'docs/a.md', 'deadbeef', 1000);
    expect(stub.calls).toEqual([{ owner: 'acme', repo: 'api', path: 'docs/a.md', ref: 'deadbeef' }]);
  });

  it('S-AC-9: a non-404 error is not swallowed', async () => {
    fail(403, 'Forbidden');
    await expect(new OctokitGitHubClient('t').getFileContent(repo, 'a.md', 'abc', 1000)).rejects.toThrow('Forbidden');
  });
});
