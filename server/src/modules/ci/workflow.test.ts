import { describe, expect, it } from 'vitest';
import { buildWorkflow } from './workflow.js';

const wf = (t: Parameters<typeof buildWorkflow>[0] = ['opened', 'synchronize'], p: Parameters<typeof buildWorkflow>[1] = 'github_review') =>
  buildWorkflow(t, p);
const lines = (s: string) => s.split('\n');

describe('buildWorkflow (AC-4)', () => {
  it('name and trigger types', () => {
    expect(wf()).toContain('name: DevDigest Review');
    expect(wf()).toContain('types: [opened, synchronize]');
    expect(wf(['opened', 'synchronize', 'reopened'])).toContain('types: [opened, synchronize, reopened]');
    expect(wf(['synchronize'])).toContain('types: [synchronize]');
  });

  it('permissions has exactly two entries', () => {
    const l = lines(wf());
    const i = l.findIndex((x) => x === 'permissions:');
    expect(i).toBeGreaterThan(-1);
    const entries: string[] = [];
    for (let j = i + 1; j < l.length && l[j]!.startsWith('  '); j++) entries.push(l[j]!.trim());
    expect(entries).toEqual(['contents: read', 'pull-requests: write']);
  });

  it('concurrency, timeout, node, run line, env', () => {
    const w = wf(['opened'], 'pr_comment');
    expect(w).toMatch(/group: devdigest-review-\$\{\{ github\.event\.pull_request\.number \}\}/);
    expect(w).toContain('cancel-in-progress: true');
    expect(w).toContain('runs-on: ubuntu-latest');
    expect(w).toContain('timeout-minutes: 10');
    expect(w).toContain('node-version: 22');
    expect(w).toContain('run: node .devdigest/runner/index.js');
    expect(w).toContain('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(w).toContain('GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(w).toContain('PR_NUMBER: ${{ github.event.pull_request.number }}');
    expect(w).toContain('DEVDIGEST_POST_AS: pr_comment');
  });

  it('artifact upload', () => {
    const w = wf();
    expect(w).toContain('name: devdigest-result');
    expect(w).toContain('path: devdigest-result.json');
    expect(w).toContain('retention-days: 7');
    expect(w).toContain("if: ${{ always() && steps.runner.outputs.present == 'true' }}");
  });
});

describe('buildWorkflow hardening (AC-5, S-1, S-3)', () => {
  const w = wf();

  it('checks out the base SHA without credentials; no pull_request_target', () => {
    expect(w).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(w).toContain('persist-credentials: false');
    expect(w).not.toContain('pull_request_target');
  });

  it('pins the three actions exactly', () => {
    const uses = lines(w).filter((l) => /^\s*-?\s*uses:/.test(l)).map((l) => l.replace(/^\s*-?\s*uses:\s*/, ''));
    expect(uses).toEqual([
      'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
      'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
      'actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2',
    ]);
    for (const u of uses) {
      expect(u).toMatch(/@[0-9a-f]{40} # v\d/);
      expect(u.startsWith('actions/')).toBe(true);
    }
  });

  it('fork notice and same-repo gating', () => {
    expect(w).toContain('github.event.pull_request.head.repo.full_name != github.repository');
    expect(w).toContain('::notice::');
    expect(w).toContain('github.event.pull_request.head.repo.full_name == github.repository');
    expect(w).toContain("steps.runner.outputs.present == 'true'");
  });

  it('absent runner emits a notice and never exits non-zero', () => {
    expect(w).toContain('present=false');
    expect(w).not.toMatch(/exit 1/);
  });

  it('only two secrets, OPENROUTER_API_KEY only as a secrets reference', () => {
    const names = new Set([...w.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1]));
    expect([...names].sort()).toEqual(['GITHUB_TOKEN', 'OPENROUTER_API_KEY']);
    const occurrences = lines(w).filter((l) => l.includes('OPENROUTER_API_KEY'));
    for (const l of occurrences) expect(l.trim()).toBe('OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}');
    expect(occurrences).toHaveLength(1);
  });

  it('no ${{ in any run: command', () => {
    const l = lines(w);
    for (let i = 0; i < l.length; i++) {
      const m = l[i]!.match(/^(\s*)(?:- )?run:\s*(.*)$/);
      if (!m) continue;
      const indent = m[1]!.length;
      expect(m[2]).not.toContain('${{');
      if (m[2] === '|' || m[2] === '>') {
        for (let j = i + 1; j < l.length && (l[j]!.trim() === '' || l[j]!.search(/\S/) > indent); j++) {
          expect(l[j]).not.toContain('${{');
        }
      }
    }
  });

  it('uses no attacker-controlled PR text expressions', () => {
    for (const bad of [
      'github.event.pull_request.title',
      'github.event.pull_request.body',
      'github.event.pull_request.head.ref',
      'github.event.pull_request.head.label',
      'github.head_ref',
      'github.event.head_commit.message',
      'github.actor',
    ]) {
      expect(w).not.toContain(bad);
    }
  });
});
