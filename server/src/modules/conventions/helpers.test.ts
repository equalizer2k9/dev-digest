import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Container } from '../../platform/container.js';
import {
  MAX_SAMPLE_BYTES,
  MAX_SAMPLE_LINES,
  NO_RANKED_SAMPLES_WARNING,
} from './constants.js';
import {
  buildSkillDraft,
  capLines,
  normalizeRule,
  numberLines,
  selectSamples,
  verifyEvidence,
  type ConventionSample,
  type LlmConventionCandidate,
} from './helpers.js';
import type { ConventionRow, ConventionRowWithSha } from './repository.js';

/**
 * Unit coverage for the deterministic half of the conventions feature: sample
 * selection (spec §2), evidence verification (§4), the rescan merge key (§5) and
 * the draft body (§6). Nothing here may resolve a model — the container handed
 * to `selectSamples` throws from `llm` on purpose (AC-39).
 */

const REPO = { id: 'repo-1', owner: 'acme', name: 'widgets' };

/**
 * A container whose `llm` THROWS. Every test builds its samples through this, so
 * any accidental model call in the selection path fails the suite loudly.
 */
function container(
  files: Record<string, string>,
  ranked: string[] = [],
  clonePath?: string,
): Container {
  return {
    git: {
      readFile: async (_ref: unknown, path: string) => {
        const content = files[path];
        if (content === undefined) throw new Error(`ENOENT: ${path}`);
        return content;
      },
      // Omitted unless a test opts in, so the clone listing degrades exactly as
      // it does without a checkout and the rest of the suite stays filesystem-free.
      ...(clonePath !== undefined ? { clonePathFor: () => clonePath } : {}),
    },
    repoIntel: {
      getConventionSamples: async () => ranked,
    },
    llm: async () => {
      throw new Error('selectSamples must not resolve an LLM provider');
    },
  } as unknown as Container;
}

function sample(path: string, lines: string[]): ConventionSample {
  return { path, lines, numbered: numberLines(lines) };
}

function candidate(over: Partial<LlmConventionCandidate> = {}): LlmConventionCandidate {
  return {
    category: 'structure',
    rule: 'Services throw NotFoundError instead of returning null',
    evidence: { file: 'src/a.ts', start_line: 1, end_line: 2 },
    confidence: 0.9,
    ...over,
  };
}

function row(over: Partial<ConventionRow> = {}): ConventionRowWithSha {
  return {
    row: {
      id: 'cand-1',
      workspaceId: 'ws-1',
      repoId: REPO.id,
      scanId: 'scan-1',
      category: 'naming',
      rule: 'Files and folders are kebab-case',
      ruleKey: 'files and folders are kebab case',
      evidencePath: 'src/run-executor.ts',
      evidenceStartLine: 10,
      evidenceEndLine: 12,
      evidenceSnippet: 'export function runExecutor() {',
      confidence: 0.92,
      status: 'accepted',
      accepted: true,
      createdAt: new Date('2026-09-20T10:00:00.000Z'),
      ...over,
    },
    headSha: 'abc1234',
  };
}

describe('selectSamples — configs + ranked paths, no model call (spec §2)', () => {
  let cloneDir: string | undefined;
  afterEach(async () => {
    if (cloneDir) await rm(cloneDir, { recursive: true, force: true });
    cloneDir = undefined;
  });

  it('reads configs and ranked files with a container whose llm throws (AC-39)', async () => {
    const c = container(
      {
        '.prettierrc': '{ "semi": true }',
        'server/package.json': '{ "name": "api" }',
        'server/tsconfig.json': '{ "compilerOptions": {} }',
        'server/src/service.ts': 'export class Service {}',
      },
      ['server/src/service.ts'],
    );

    const { samples, warnings } = await selectSamples(c, REPO);

    // Root configs first, then the package dir's, then the ranked source file.
    expect(samples.map((s) => s.path)).toEqual([
      '.prettierrc',
      'server/tsconfig.json',
      'server/src/service.ts',
    ]);
    expect(warnings).toEqual([]);
  });

  /**
   * The spec's "configs only → proceed" path. With repo-intel off there are no
   * ranked paths to derive a package directory from, so the ONLY way to find a
   * sub-package's tsconfig is to list the clone — which this repo needs, having
   * no root tsconfig of its own.
   */
  it('finds a sub-package config by listing the clone when nothing is ranked', async () => {
    cloneDir = await mkdtemp(join(tmpdir(), 'conv-samples-'));
    await mkdir(join(cloneDir, 'server'));
    await mkdir(join(cloneDir, 'node_modules'));

    const c = container(
      {
        'server/package.json': '{ "name": "api" }',
        'server/tsconfig.json': '{ "compilerOptions": {} }',
        'node_modules/package.json': '{ "name": "nope" }',
        'node_modules/tsconfig.json': '{ "compilerOptions": {} }',
      },
      [],
      cloneDir,
    );

    const { samples, warnings } = await selectSamples(c, REPO);

    expect(samples.map((s) => s.path)).toEqual(['server/tsconfig.json']);
    expect(warnings).toEqual([NO_RANKED_SAMPLES_WARNING]);
  });

  it('skips a file whose content is blank, however the adapter reports it', async () => {
    const c = container({ '.prettierrc': '', 'src/a.ts': '   \n\n', 'src/b.ts': 'const b = 1;' }, [
      'src/a.ts',
      'src/b.ts',
    ]);

    const { samples } = await selectSamples(c, REPO);

    expect(samples.map((s) => s.path)).toEqual(['src/b.ts']);
  });

  it('probes the repo root AND every first-level dir that has a package.json', async () => {
    const c = container(
      {
        'server/package.json': '{}',
        'server/tsconfig.json': 'server ts',
        'client/package.json': '{}',
        'client/.eslintrc.json': 'client eslint',
        // `docs` has no package.json, so its config is NOT a probe target.
        'docs/tsconfig.json': 'docs ts',
        'server/src/a.ts': 'a',
        'client/src/b.ts': 'b',
        'docs/c.ts': 'c',
      },
      ['server/src/a.ts', 'client/src/b.ts', 'docs/c.ts'],
    );

    const { samples } = await selectSamples(c, REPO);
    const paths = samples.map((s) => s.path);

    expect(paths).toContain('server/tsconfig.json');
    expect(paths).toContain('client/.eslintrc.json');
    expect(paths).not.toContain('docs/tsconfig.json');
  });

  it('takes the FIRST match of a config family only', async () => {
    const c = container({
      'eslint.config.js': 'flat config',
      'eslint.config.mjs': 'also flat config',
    });

    const { samples } = await selectSamples(c, REPO);

    expect(samples.map((s) => s.path)).toEqual(['eslint.config.js']);
  });

  it('warns (and still returns the configs) when repo-intel has no ranked paths', async () => {
    const c = container({ 'tsconfig.json': '{}' }, []);

    const { samples, warnings } = await selectSamples(c, REPO);

    expect(samples.map((s) => s.path)).toEqual(['tsconfig.json']);
    expect(warnings).toEqual([NO_RANKED_SAMPLES_WARNING]);
  });

  it('returns nothing at all when neither a config nor a ranked file can be read', async () => {
    const { samples, warnings } = await selectSamples(container({}, []), REPO);

    expect(samples).toEqual([]);
    expect(warnings).toEqual([NO_RANKED_SAMPLES_WARNING]);
  });

  it('renders 1-based line-number prefixes so the model can only cite what it saw', async () => {
    const c = container({ 'tsconfig.json': 'one\ntwo\nthree' });

    const { samples } = await selectSamples(c, REPO);

    expect(samples[0]!.numbered).toBe('1| one\n2| two\n3| three');
    expect(samples[0]!.lines).toEqual(['one', 'two', 'three']);
  });
});

describe('capLines — the sample caps', () => {
  it('cuts at MAX_SAMPLE_LINES lines', () => {
    const lines = capLines(
      Array.from({ length: MAX_SAMPLE_LINES + 120 }, (_, i) => `line ${i}`).join('\n'),
    );
    expect(lines).toHaveLength(MAX_SAMPLE_LINES);
    expect(lines[0]).toBe('line 0');
  });

  it('cuts at MAX_SAMPLE_BYTES when a few long lines blow the budget first', () => {
    const fat = 'x'.repeat(2_000);
    const lines = capLines(Array.from({ length: 20 }, () => fat).join('\n'));

    expect(lines.length).toBeLessThan(MAX_SAMPLE_LINES);
    expect(lines.join('\n').length).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
    // 2001 bytes per line (+ newline) → the 4th line would cross 8_000.
    expect(lines).toHaveLength(3);
  });

  it('counts BYTES, not characters, so multi-byte source is not under-counted', () => {
    const wide = '№'.repeat(2_000); // 3 bytes per char
    const lines = capLines(Array.from({ length: 10 }, () => wide).join('\n'));

    expect(Buffer.byteLength(lines.join('\n'), 'utf8')).toBeLessThanOrEqual(MAX_SAMPLE_BYTES);
  });
});

describe('verifyEvidence — code decides, not the model (spec §4)', () => {
  const samples = [
    sample('src/a.ts', [
      "import { NotFoundError } from './errors.js';",
      '',
      'export class Service {',
      '  async get(id: string) {',
      "    throw new NotFoundError('nope');",
      '  }',
      '}',
    ]),
  ];

  it('drops a candidate citing a file that was never sampled', () => {
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/invented.ts', start_line: 1, end_line: 2 } }),
      samples,
    );

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('src/invented.ts');
  });

  it('drops a range that runs past the end of the file', () => {
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/a.ts', start_line: 5, end_line: 40 } }),
      samples,
    );

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('past end of file');
  });

  it('drops an inverted range', () => {
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/a.ts', start_line: 4, end_line: 2 } }),
      samples,
    );

    expect(check.ok).toBe(false);
  });

  it('drops a range that is blank or comment-only', () => {
    const commented = [
      sample('src/notes.ts', ['// a comment', '', '  /* block */', '   * continued', '# hash']),
    ];
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/notes.ts', start_line: 1, end_line: 5 } }),
      commented,
    );

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('blank or comment-only');
  });

  it('drops a range wider than the allowed span', () => {
    const long = sample(
      'src/long.ts',
      Array.from({ length: 80 }, (_, i) => `const v${i} = ${i};`),
    );
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/long.ts', start_line: 1, end_line: 60 } }),
      [long],
    );

    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain('too wide');
  });

  it('re-reads the snippet from the FILE, never from the model (AC-40b)', () => {
    const check = verifyEvidence(
      candidate({ evidence: { file: 'src/a.ts', start_line: 4, end_line: 6 } }),
      samples,
    );

    expect(check.ok).toBe(true);
    expect(check.ok === true && check.evidence).toEqual({
      path: 'src/a.ts',
      startLine: 4,
      endLine: 6,
      snippet: ['  async get(id: string) {', "    throw new NotFoundError('nope');", '  }'].join(
        '\n',
      ),
    });
  });
});

describe('normalizeRule — the rescan merge key (spec §5)', () => {
  it('collapses case, punctuation and whitespace to one key', () => {
    expect(normalizeRule('Files  and folders — are kebab-case!')).toBe(
      normalizeRule('files and folders are kebab case'),
    );
    expect(normalizeRule('  Use Zod at the route edge.  ')).toBe('use zod at the route edge');
  });

  it('keeps two genuinely different rules apart', () => {
    expect(normalizeRule('Files are kebab-case')).not.toBe(
      normalizeRule('Components are PascalCase'),
    );
  });
});

describe('buildSkillDraft — accepted rows only (spec §6)', () => {
  const rows = [
    row(),
    row({ id: 'cand-2', status: 'pending', accepted: false, rule: 'A merely pending rule' }),
    row({ id: 'cand-3', status: 'rejected', accepted: false, rule: 'A rejected rule' }),
  ];

  it('ignores pending and rejected rules (AC-42, AC-48)', () => {
    const draft = buildSkillDraft('widgets', rows);

    expect(draft.count).toBe(1);
    expect(draft.body).toContain('Files and folders are kebab-case');
    expect(draft.body).not.toContain('A merely pending rule');
    expect(draft.body).not.toContain('A rejected rule');
  });

  it('defaults name/type/enabled and counts the accepted rules in the description', () => {
    const draft = buildSkillDraft('widgets', rows);

    expect(draft.name).toBe('repo-conventions');
    expect(draft.type).toBe('convention');
    expect(draft.enabled).toBe(true);
    expect(draft.description).toBe('1 house conventions extracted from widgets');
  });

  it('renders an H1, the framing sentence, a slug heading, the range and the snippet', () => {
    const draft = buildSkillDraft('widgets', [row()]);

    expect(draft.body.startsWith('# Conventions of widgets')).toBe(true);
    expect(draft.body).toContain(
      'Flag changes that violate any rule below and cite the offending `file:line`.',
    );
    expect(draft.body).toContain('## files-and-folders-are-kebab-case');
    expect(draft.body).toContain('Detected in `src/run-executor.ts:L10-L12`');
    expect(draft.body).toContain('```\nexport function runExecutor() {\n```');
  });

  it('is an empty-bodied draft with count 0 when nothing is accepted', () => {
    const draft = buildSkillDraft('widgets', [rows[1]!, rows[2]!]);

    expect(draft.count).toBe(0);
    expect(draft.body).not.toContain('## ');
  });
});
