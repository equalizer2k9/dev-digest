import { describe, expect, it } from 'vitest';
import { parseRepoUrl, withGitHubToken } from './helpers.js';

const TEST_TOKEN = 'ghp_test1234567890abcdefghijklmnopqrstu';

describe('withGitHubToken', () => {
  it('embeds the token into an https github.com URL', () => {
    expect(withGitHubToken('https://github.com/acme/payments-api.git', TEST_TOKEN)).toBe(
      `https://x-access-token:${TEST_TOKEN}@github.com/acme/payments-api.git`,
    );
  });

  it('leaves an ssh URL untouched', () => {
    const url = 'git@github.com:acme/payments-api.git';
    expect(withGitHubToken(url, TEST_TOKEN)).toBe(url);
  });

  it('leaves a non-GitHub host untouched', () => {
    const url = 'https://gitlab.com/acme/payments-api.git';
    expect(withGitHubToken(url, TEST_TOKEN)).toBe(url);
  });
});

describe('parseRepoUrl', () => {
  it('reads owner and name from https and ssh forms', () => {
    expect(parseRepoUrl('https://github.com/acme/payments-api')).toEqual({
      owner: 'acme',
      name: 'payments-api',
    });
    expect(parseRepoUrl('git@github.com:acme/payments-api.git')).toEqual({
      owner: 'acme',
      name: 'payments-api',
    });
  });

  it('rejects a URL without owner/name', () => {
    expect(() => parseRepoUrl('https://github.com/acme')).toThrow(/Could not parse/);
  });
});
