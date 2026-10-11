import { describe, it, expect } from 'vitest';
import type { SmartDiffRole } from '@devdigest/shared';
import { classifyFile } from './classify-file.js';

/** Pure path → role table. No app, no container, no mock: classifyFile takes a string. */
const CASES: [name: string, path: string, role: SmartDiffRole][] = [
  // ---- the three disputed cases (spec §3): reordering the rules fails these
  ['disputed: snapshot inside __tests__ (1 before 2)', '__tests__/__snapshots__/x.snap', 'boilerplate'],
  ['disputed: skill markdown under .claude (3 before 4)', '.claude/skills/security/SKILL.md', 'wiring'],
  ['disputed: README under e2e (2 before 4)', 'e2e/README.md', 'tests'],

  // ---- deviations from the requirements' table
  ['deviation: dist at depth', 'server/dist/x.js', 'boilerplate'],
  ['deviation: build at depth', 'client/build/x.js', 'boilerplate'],
  ['deviation: skills-lock.json', 'skills-lock.json', 'boilerplate'],
  ['deviation: drizzle journal', 'server/src/db/migrations/meta/_journal.json', 'boilerplate'],
  ['deviation: drizzle snapshot', 'server/src/db/migrations/meta/0010_snapshot.json', 'boilerplate'],
  ['deviation: *.spec.tsx', 'x/Foo.spec.tsx', 'tests'],
  ['deviation: nested index.tsx', 'x/Foo/index.tsx', 'wiring'],
  ['deviation: package.json', 'server/package.json', 'wiring'],
  ['deviation: migration .sql stays core', 'server/src/db/migrations/0010_x.sql', 'core'],

  // ---- rule 1: boilerplate
  ['boilerplate: *.lock', 'Cargo.lock', 'boilerplate'],
  ['boilerplate: yarn.lock nested', 'a/b/yarn.lock', 'boilerplate'],
  ['boilerplate: pnpm-lock.yaml', 'client/pnpm-lock.yaml', 'boilerplate'],
  ['boilerplate: package-lock.json', 'reviewer-core/package-lock.json', 'boilerplate'],
  ['boilerplate: package-lock.json under e2e (1 before 2)', 'e2e/package-lock.json', 'boilerplate'],
  ['boilerplate: dist at root', 'dist/index.js', 'boilerplate'],
  ['boilerplate: build at root', 'build/main.js', 'boilerplate'],
  ['boilerplate: __snapshots__', 'src/__snapshots__/a.txt', 'boilerplate'],
  ['boilerplate: *.snap', 'src/a.test.ts.snap', 'boilerplate'],
  ['boilerplate: *.generated.*', 'src/api.generated.ts', 'boilerplate'],
  ['boilerplate: *.min.js', 'public/vendor.min.js', 'boilerplate'],

  // ---- rule 2: tests
  ['tests: *.test.ts', 'server/test/contracts.test.ts', 'tests'],
  ['tests: *.test.tsx', 'client/src/Foo/Foo.test.tsx', 'tests'],
  ['tests: *.it.test.ts', 'server/test/reviews.it.test.ts', 'tests'],
  ['tests: *.spec.ts', 'src/a.spec.ts', 'tests'],
  ['tests: test dir', 'server/test/helpers/pg.ts', 'tests'],
  ['tests: tests dir', 'tests/fixtures/a.json', 'tests'],
  ['tests: __tests__ dir', 'src/__tests__/helper.ts', 'tests'],
  ['tests: e2e dir', 'e2e/specs/04-pr-findings.flow.json', 'tests'],

  // ---- rule 3: wiring
  ['wiring: index.ts', 'server/src/modules/index.ts', 'wiring'],
  ['wiring: index.js', 'lib/index.js', 'wiring'],
  ['wiring: *.config.*', 'client/next.config.ts', 'wiring'],
  ['wiring: tsconfig*.json', 'server/tsconfig.build.json', 'wiring'],
  ['wiring: .eslintrc*', '.eslintrc.cjs', 'wiring'],
  ['wiring: .env*', 'server/.env.example', 'wiring'],
  ['wiring: docker-compose*.yml', 'docker-compose.dev.yml', 'wiring'],
  ['wiring: .github/**', '.github/workflows/ci.yml', 'wiring'],
  ['wiring: .claude/**', '.claude/agents/implementation-planner.md', 'wiring'],

  // ---- rule 4: docs
  ['docs: nested *.md', 'server/specs/smart-diff.md', 'docs'],
  ['docs: docs/**', 'docs/hw3/diagram.png', 'docs'],
  ['docs: README*', 'README', 'docs'],
  ['docs: README.rst', 'pkg/README.rst', 'docs'],
  ['docs: CHANGELOG*', 'CHANGELOG', 'docs'],
  ['docs: LICENSE', 'LICENSE', 'docs'],

  // ---- rule 5: core
  ['core: plain source', 'server/src/modules/reviews/service.ts', 'core'],
  ['core: dist-lookalike dir name', 'src/distribution/a.ts', 'core'],
  ['core: docs-lookalike below root', 'src/docs/a.ts', 'core'],
];

describe('classifyFile', () => {
  it.each(CASES)('%s: %s', (_name, path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('is deterministic', () => {
    expect(classifyFile('server/src/a.ts')).toBe(classifyFile('server/src/a.ts'));
  });
});
