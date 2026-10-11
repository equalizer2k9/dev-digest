import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client.js';
import {
  noConventions, noReview, runFailed, toToolError, unknownAgent, unknownPr, unknownRepo,
} from './errors.js';

const msg = (e: unknown) => {
  const r = toToolError(e);
  expect(r.isError).toBe(true);
  return r.content[0]!.text;
};

afterEach(() => vi.unstubAllEnvs());

describe('toToolError — one row per message of the spec', () => {
  it('API unreachable', () => {
    vi.stubEnv('DEVDIGEST_API_URL', 'http://localhost:3001');
    expect(msg(new ApiError('network_error', 'fetch failed', 0))).toBe(
      'DevDigest API is not reachable at http://localhost:3001. Start it with ./scripts/dev.sh, then retry.',
    );
  });
  it('unknown agent', () => {
    expect(msg(unknownAgent('x', ['A', 'B']))).toBe("Agent 'x' not found. Call list_agents and pass one of: A, B.");
  });
  it('unknown PR', () => {
    expect(msg(unknownPr(7, 'a/b'))).toBe(
      'PR #7 not found in a/b. Check the number with `gh pr list`; the PR must be imported in DevDigest.',
    );
  });
  it('unknown repo', () => {
    expect(msg(unknownRepo('x/y', ['a/b']))).toBe(
      "Repo 'x/y' is not imported. Known repos: a/b. Pass repo as owner/name.",
    );
  });
  it('no review yet', () => {
    expect(msg(noReview(7))).toBe('No review for PR #7 yet. Call run_agent_on_pr first.');
  });
  it('run failed', () => {
    expect(msg(runFailed('LLM down'))).toBe('Run failed: LLM down. Fix the cause and call run_agent_on_pr again.');
  });
  it('429', () => {
    expect(msg(new ApiError('http_429', 'Too many', 429))).toBe(
      'Rate limited (10 review starts per minute). Wait a minute and retry.',
    );
  });
  it('no accepted conventions', () => {
    expect(msg(noConventions('a/b'))).toBe(
      'No accepted conventions for a/b. Open its Conventions page in DevDigest, run a scan and accept rules.',
    );
  });
  it('other API error carries status and code, not a bare status', () => {
    expect(msg(new ApiError('validation_error', 'bad id', 422))).toMatch(/422 validation_error.*bad id/);
  });
  it('unknown exception is generic and leaks nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(msg(new Error('secret internals'))).not.toMatch(/secret internals/);
  });
});
