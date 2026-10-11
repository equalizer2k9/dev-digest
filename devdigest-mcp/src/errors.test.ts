import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client.js';
import {
  noConventions, noReview, runFailed, toToolError, unknownAgent, unknownPr, unknownRepo,
} from './errors.js';

const body = (e: unknown) => {
  const r = toToolError(e);
  expect(r.isError).toBe(true);
  return JSON.parse(r.content[0]!.text) as Record<string, unknown>;
};

afterEach(() => vi.unstubAllEnvs());

describe('toToolError — one row per message of the spec (fixed wording, data in fields)', () => {
  it('API unreachable', () => {
    vi.stubEnv('DEVDIGEST_API_URL', 'http://localhost:3001');
    expect(body(new ApiError('network_error', 'fetch failed', 0))).toEqual({
      error: 'DevDigest API is not reachable at http://localhost:3001.',
      hint: 'Start it with ./scripts/dev.sh, then retry.',
    });
  });
  it('unknown agent', () => {
    expect(body(unknownAgent('x', ['A', 'B']))).toEqual({
      error: 'Agent not found.',
      hint: 'Call list_agents and pass the name or id of one of known_agents.',
      requested_agent: 'x',
      known_agents: ['A', 'B'],
    });
  });
  it('unknown PR', () => {
    expect(body(unknownPr(7, 'a/b'))).toEqual({
      error: 'PR #7 not found in the repo.',
      hint: 'Check the number with `gh pr list`; the PR must be imported in DevDigest.',
      repo: 'a/b',
    });
  });
  it('unknown repo', () => {
    expect(body(unknownRepo('x/y', ['a/b']))).toEqual({
      error: 'Repo is not imported or not given.',
      hint: 'Pass repo as owner/name, one of known_repos.',
      requested_repo: 'x/y',
      known_repos: ['a/b'],
    });
  });
  it('no review yet', () => {
    expect(body(noReview(7))).toEqual({
      error: 'No review for PR #7 yet.',
      hint: 'Call run_agent_on_pr first.',
    });
  });
  it('run failed', () => {
    expect(body(runFailed('LLM down'))).toEqual({
      error: 'Run failed.',
      hint: 'Fix the cause (see run_error) and call run_agent_on_pr again.',
      run_error: 'LLM down',
    });
  });
  it('429', () => {
    expect(body(new ApiError('http_429', 'Too many', 429))).toEqual({
      error: 'Rate limited (10 review starts per minute).',
      hint: 'Wait a minute and retry.',
    });
  });
  it('no accepted conventions', () => {
    expect(body(noConventions('a/b'))).toEqual({
      error: 'No accepted conventions for the repo.',
      hint: 'Open its Conventions page in DevDigest, run a scan and accept rules.',
      repo: 'a/b',
    });
  });
  it('other API error carries status and safe code, not the message', () => {
    expect(body(new ApiError('validation_error', 'bad id', 422))).toMatchObject({
      error: 'DevDigest API returned an error.', status: 422, code: 'validation_error',
    });
    expect(JSON.stringify(body(new ApiError('validation_error', 'bad id', 422)))).not.toMatch(/bad id/);
  });
  it('unknown exception is generic and leaks nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(JSON.stringify(body(new Error('secret internals')))).not.toMatch(/secret internals/);
  });
});
