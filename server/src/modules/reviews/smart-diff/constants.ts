import type { SmartDiffRole } from '@devdigest/shared';

// Smart Diff role rules — the only place patterns and role orders live.
//
// A pattern is read like a .gitignore entry, against the path exactly as GitHub
// reports it (forward slashes, no leading `./`), case-sensitive:
//   - no slash               → glob on the basename, any depth   (`*.lock`, `index.ts`)
//   - `**/name`              → same as above, spelled with a leading `**/`
//   - `**/a/**`, `**/a/b/**` → that run of directory segments at any depth, root included
//   - `name/**`              → anchored at the repository root   (`e2e/**`, `docs/**`)
// `*` matches any run of characters inside one path segment.
export interface RoleRule {
  role: SmartDiffRole;
  patterns: readonly string[];
}

/**
 * MATCH precedence: the first rule with a matching pattern wins. This is NOT
 * the display order below — the two sequences differ on purpose.
 */
export const MATCH_RULES: readonly RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      '*.lock',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'skills-lock.json',
      '**/dist/**',
      '**/build/**',
      '**/migrations/meta/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      'index.ts',
      'index.js',
      'index.tsx',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
  },
];

/** Role of a path no rule matches. */
export const FALLBACK_ROLE: SmartDiffRole = 'core';

/**
 * DISPLAY position of each role's group in the response. Typed over the enum,
 * so a role added to `SmartDiffRole` without a position fails typecheck.
 */
const DISPLAY_POSITION: Record<SmartDiffRole, number> = {
  core: 0,
  tests: 1,
  wiring: 2,
  docs: 3,
  boilerplate: 4,
};

/** DISPLAY order: where each role's group appears in the response. */
export const DISPLAY_ORDER: readonly SmartDiffRole[] = (
  Object.keys(DISPLAY_POSITION) as SmartDiffRole[]
).sort((a, b) => DISPLAY_POSITION[a] - DISPLAY_POSITION[b]);
