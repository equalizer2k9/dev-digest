import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  EvalMetric,
  EvalRun,
  EvalExpectation,
  EvalFrozenMeta,
  EvalCaseResult,
  EvalRunRecord,
  EvalCaseRow,
  EvalCaseCreated,
  EvalAgentOverview,
  EvalCompare,
  EvalDashboard,
} from '@devdigest/shared';

const UUID = '11111111-1111-4111-8111-111111111111';
const TS = '2026-10-15T10:00:00.000Z';

const expectation = {
  type: 'must_find',
  file: 'src/a.ts',
  start_line: 10,
  end_line: 12,
  title: 'Null deref',
};

const run = (over: Record<string, unknown> = {}) => ({
  id: UUID,
  agent_id: UUID,
  agent_name: 'Security',
  agent_version: 2,
  provider: 'openai',
  model: 'gpt-4o',
  skills: [{ name: 'owasp', version: 1 }],
  status: 'completed',
  has_errors: false,
  error: null,
  started_at: TS,
  finished_at: TS,
  recall: 1,
  precision: null,
  citation_accuracy: 0.5,
  passed: 1,
  total: 2,
  cost_usd: null,
  ...over,
});

describe('shapes', () => {
  it('EvalMetric accepts 0..1 and null, rejects the rest', () => {
    for (const ok of [0, 0.5, 1, null]) expect(EvalMetric.safeParse(ok).success).toBe(true);
    for (const bad of [1.01, -0.1, 'n/a']) expect(EvalMetric.safeParse(bad).success).toBe(false);
  });

  it('EvalRun keeps its fixture and accepts null metrics', () => {
    const base = {
      recall: 0.82,
      precision: 0.91,
      citation_accuracy: 0.95,
      traces_passed: 17,
      traces_total: 20,
      duration_ms: 12000,
      cost_usd: 0.23,
      per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
    };
    expect(EvalRun.safeParse(base).success).toBe(true);
    expect(
      EvalRun.safeParse({ ...base, recall: null, precision: null, citation_accuracy: null }).success,
    ).toBe(true);
  });

  it('EvalExpectation and EvalFrozenMeta parse', () => {
    expect(EvalExpectation.safeParse(expectation).success).toBe(true);
    expect(EvalExpectation.safeParse({ ...expectation, type: 'other' }).success).toBe(false);
    expect(
      EvalFrozenMeta.safeParse({
        pr_id: UUID,
        pr_number: 7,
        pr_title: 't',
        pr_description: '',
        file: 'src/a.ts',
      }).success,
    ).toBe(true);
  });

  it('EvalCaseResult parses an error case with null cost', () => {
    const r = EvalCaseResult.safeParse({
      case_id: UUID,
      name: 'n',
      type: 'must_find',
      file: 'src/a.ts',
      start_line: 1,
      end_line: 2,
      status: 'error',
      kept: 0,
      dropped: 0,
      kept_findings: [],
      cost_usd: null,
      error: 'boom',
    });
    expect(r.success).toBe(true);
  });

  it('EvalRunRecord parses and rejects the status done', () => {
    expect(EvalRunRecord.safeParse(run()).success).toBe(true);
    expect(EvalRunRecord.safeParse(run({ status: 'done' })).success).toBe(false);
  });

  it('EvalCaseRow accepts latest_status never_run', () => {
    const row = {
      id: UUID,
      name: 'n',
      agent_id: UUID,
      expectation,
      source_finding_id: null,
      created_at: TS,
      latest_status: 'never_run',
    };
    expect(EvalCaseRow.safeParse(row).success).toBe(true);
    expect(EvalCaseRow.safeParse({ ...row, latest_status: 'weird' }).success).toBe(false);
    expect(
      EvalCaseCreated.safeParse({ case: row, agent_id: UUID, agent_name: 'A', created: true }).success,
    ).toBe(true);
    expect(
      EvalAgentOverview.safeParse({ agent_id: UUID, agent_name: 'A', cases: [row], runs: [run()] }).success,
    ).toBe(true);
  });

  it('EvalCompare parses with an unavailable prompt and null deltas', () => {
    const r = EvalCompare.safeParse({
      agent_id: UUID,
      agent_name: 'A',
      earlier: run(),
      later: run(),
      delta: { recall: null, precision: null, citation_accuracy: null, cost_usd: null },
      changed: [],
      added: [],
      removed: [],
      prompt: { status: 'unavailable', unavailable_versions: [1], lines: [] },
      skills: { only_earlier: [], only_later: [], reordered: false },
    });
    expect(r.success).toBe(true);
  });

  it('EvalDashboard parses the new shape', () => {
    const r = EvalDashboard.safeParse({
      agents: [
        { agent_id: UUID, name: 'A', enabled: false, cases_total: 3, latest: run() },
        { agent_id: UUID, name: 'B', enabled: true, cases_total: 1, latest: null },
      ],
      recent_runs: [run()],
    });
    expect(r.success).toBe(true);
  });
});

// ---- parity (red until the client copy is updated, T-C1) ----

const ROOT = path.resolve(__dirname, '../..');
const SERVER_SHARED = path.join(ROOT, 'server/src/vendor/shared');
const CLIENT_SHARED = path.join(ROOT, 'client/src/vendor/shared');

// Recorded before T-S1 (`diff -rq` of the two copies, and the number of differing
// lines outside the Eval regions). Divergence may shrink, never grow.
const BASELINE_DIFFERING_FILES = [
  'contracts/eval-ci.ts',
  'contracts/knowledge.ts',
  'contracts/productionize.ts',
  'contracts/trace.ts',
];
const BASELINE_OUTSIDE_DIFF_LINES: Record<string, number> = {
  'contracts/knowledge.ts': 35,
  'contracts/eval-ci.ts': 33,
};

const KNOWLEDGE = 'contracts/knowledge.ts';
const EVAL_CI = 'contracts/eval-ci.ts';

/** [start, end) line indexes of the Eval region of a contract file. */
function regionBounds(rel: string, lines: string[]): [number, number] {
  if (rel === KNOWLEDGE) {
    return [lines.indexOf('// ---- Eval ----'), lines.indexOf('// ---- Memory ----')];
  }
  // eval-ci: banner "// ====" line above the heading, up to the banner above "Compose Review"
  const head = lines.findIndex((l) => l.startsWith('// Eval — case input'));
  const tail = lines.findIndex((l) => l === '// Compose Review');
  return [head - 1, tail - 1];
}

function split(root: string, rel: string) {
  const lines = readFileSync(path.join(root, rel), 'utf8').split('\n');
  const [s, e] = regionBounds(rel, lines);
  expect(s).toBeGreaterThanOrEqual(0);
  expect(e).toBeGreaterThan(s);
  return {
    region: lines.slice(s, e).join('\n'),
    outside: [...lines.slice(0, s), ...lines.slice(e)].join('\n'),
  };
}

function differingLines(a: string, b: string): number {
  const dir = mkdtempSync(path.join(tmpdir(), 'eval-parity-'));
  const fa = path.join(dir, 'a');
  const fb = path.join(dir, 'b');
  writeFileSync(fa, a);
  writeFileSync(fb, b);
  let out = '';
  try {
    execFileSync('diff', [fa, fb], { encoding: 'utf8' });
  } catch (err) {
    out = (err as { stdout?: string }).stdout ?? '';
  }
  return out.split('\n').filter((l) => /^[<>] /.test(l) || l === '<' || l === '>').length;
}

function listFiles(root: string, dir = ''): string[] {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(root, path.join(dir, d.name)) : [path.join(dir, d.name)],
  );
}

describe('parity', () => {
  for (const rel of [KNOWLEDGE, EVAL_CI]) {
    it(`Eval region of ${rel} is the same text in both copies`, () => {
      expect(split(CLIENT_SHARED, rel).region).toBe(split(SERVER_SHARED, rel).region);
    });

    it(`divergence of ${rel} outside the Eval region has not grown`, () => {
      const n = differingLines(split(SERVER_SHARED, rel).outside, split(CLIENT_SHARED, rel).outside);
      expect(n).toBeLessThanOrEqual(BASELINE_OUTSIDE_DIFF_LINES[rel]!);
    });
  }

  it('the set of differing files equals the pinned list', () => {
    const files = [...new Set([...listFiles(SERVER_SHARED), ...listFiles(CLIENT_SHARED)])].sort();
    const differing = files.filter((f) => {
      try {
        return readFileSync(path.join(SERVER_SHARED, f), 'utf8') !== readFileSync(path.join(CLIENT_SHARED, f), 'utf8');
      } catch {
        return true;
      }
    });
    expect(differing).toEqual(BASELINE_DIFFERING_FILES);
  });
});
