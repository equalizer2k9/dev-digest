import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';
import { AGENTS, BASE_ROUTES, mockApi } from './mock-api.js';

afterEach(() => vi.unstubAllGlobals());

describe('resolveRepo', () => {
  it('finds a repo by full_name, case-insensitively', async () => {
    mockApi(BASE_ROUTES);
    expect((await resolveRepo('ACME/app')).id).toBe('r1');
  });

  it('defaults to the only imported repo', async () => {
    mockApi(BASE_ROUTES);
    expect((await resolveRepo()).id).toBe('r1');
  });

  it('is ambiguous without repo when several are imported', async () => {
    mockApi({ 'GET /repos': [{ id: 'r1', full_name: 'a/b' }, { id: 'r2', full_name: 'c/d' }] });
    await expect(resolveRepo()).rejects.toThrow(/Known repos: a\/b, c\/d/);
  });

  it('rejects an unknown repo', async () => {
    mockApi(BASE_ROUTES);
    await expect(resolveRepo('x/y')).rejects.toThrow(/Repo 'x\/y' is not imported/);
  });
});

describe('resolvePull', () => {
  it('maps PR number to the row uuid', async () => {
    mockApi(BASE_ROUTES);
    expect((await resolvePull(12)).pull.id).toBe('p-uuid');
  });

  it('unknown PR names the number and the repo', async () => {
    mockApi(BASE_ROUTES);
    await expect(resolvePull(99)).rejects.toThrow('PR #99 not found in acme/app.');
  });
});

describe('resolveAgent', () => {
  it('matches by name, case-insensitively', async () => {
    mockApi(BASE_ROUTES);
    expect((await resolveAgent('security reviewer')).id).toBe('a1');
  });

  it('matches by id', async () => {
    mockApi(BASE_ROUTES);
    expect((await resolveAgent('a2')).name).toBe('General Reviewer');
  });

  it('unknown agent lists valid names', async () => {
    mockApi(BASE_ROUTES);
    await expect(resolveAgent('nope')).rejects.toThrow(
      `Call list_agents and pass one of: ${AGENTS.map((a) => a.name).join(', ')}.`,
    );
  });
});
