import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * AC-37: the eval pipeline of this feature and the repo-root `evals/` harness package
 * share nothing. This test only READS files as plain text; the feature's runtime code
 * never touches `evals/`. It is not part of `verify:l06` (AC-39 fixes four suites) and
 * runs in `pnpm test`.
 */

const SERVER = path.resolve(__dirname, '..');
const ROOT = path.resolve(SERVER, '..');

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.git', 'coverage']);

function walk(dir: string, accept: (file: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, accept));
    else if (accept(full)) out.push(full);
  }
  return out;
}

const any = () => true;

/** Every file of the feature's own code (client files are scanned when they exist). */
function featureFiles(): string[] {
  const files = [
    ...walk(path.join(SERVER, 'src/modules/eval'), any),
    path.join(SERVER, 'test/eval-contracts.test.ts'),
    path.join(ROOT, 'client/src/lib/hooks/evals.ts'),
    ...walk(path.join(ROOT, 'client/src/components/eval'), any),
    ...walk(path.join(ROOT, 'client/src/app/eval'), any),
    ...walk(path.join(ROOT, 'client/src/app/agents'), (f) => /[\\/](EvalsTab|EvalCaseButton)[\\/]/.test(f)),
    ...walk(path.join(ROOT, 'client/src/app/repos'), (f) => /[\\/](EvalsTab|EvalCaseButton)[\\/]/.test(f)),
  ];
  return files.filter((f) => existsSync(f) && statSync(f).isFile());
}

/** An import / require / string path that reaches the repo-root `evals/` package. */
const REACHES_EVALS_PACKAGE = [
  /(?:from|import|require\()\s*\(?\s*['"][^'"]*(?:\.\.\/)+evals(?:\/[^'"]*)?['"]/,
  /['"`](?:\.\.\/)+evals\//,
  /dev-digest\/evals\b/,
  /['"`]@devdigest\/evals/,
];

/** Names of the server eval module, its tables and its routes. */
const NAMES_FEATURE = [
  /modules\/eval\b/,
  /\beval_cases\b/,
  /\beval_runs\b/,
  /\/evals\/(?:compare|dashboard|runs)\b/,
  /\/eval-case\b/,
];

describe('eval boundary (AC-37)', () => {
  it('feature side: no file of the feature reaches the repo-root evals/ package', () => {
    const files = featureFiles();
    expect(files.length).toBeGreaterThan(5);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (REACHES_EVALS_PACKAGE.some((re) => re.test(text))) offenders.push(path.relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it('feature side: the verify:l06 script names no path under evals/', () => {
    const pkg = JSON.parse(readFileSync(path.join(SERVER, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts['verify:l06'];
    expect(script).toBeTruthy();
    expect(script).not.toMatch(/(^|[\s'"/])evals\//);
    expect(script).not.toMatch(/\.\.\/evals/);
  });

  it('evals side: nothing in evals/ names the server eval module, its tables or its routes', () => {
    const files = walk(path.join(ROOT, 'evals'), (f) => /\.(ts|mjs|json|yml)$/.test(f));
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const hit = NAMES_FEATURE.find((re) => re.test(text));
      if (hit) offenders.push(`${path.relative(ROOT, file)} ~ ${hit}`);
    }
    expect(offenders).toEqual([]);
  });
});
