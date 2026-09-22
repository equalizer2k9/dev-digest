/** Constants for the conventions module (sample selection → model → evidence). */

import type { ConventionStatus, FeatureModelId, SkillSource, SkillType } from '@devdigest/shared';

/**
 * Feature id read from Settings → Models. This module NEVER names a provider or
 * a model: `resolveFeatureModel(container, workspaceId, CONVENTIONS_FEATURE)` is
 * the single source of both, so changing the row in Settings changes the next
 * scan's `model` with no code change (AC-53).
 */
export const CONVENTIONS_FEATURE: FeatureModelId = 'conventions';

// ---- Sample selection (spec §2) ------------------------------------------

/** How many ranked paths we ask repo-intel for. */
export const MAX_RANKED_SAMPLES = 12;

/** Lines kept per sample file — the model only ever sees (and cites) these. */
export const MAX_SAMPLE_LINES = 200;

/** Bytes kept per sample file, applied after the line cap. */
export const MAX_SAMPLE_BYTES = 8_000;

/**
 * Config files probed at the repo root and in every first-level package dir,
 * grouped by family — the FIRST hit of each family wins, misses are silent.
 */
export const CONFIG_FAMILIES: readonly (readonly string[])[] = [
  [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.json',
    '.eslintrc.cjs',
    '.eslintrc.js',
    '.eslintrc',
  ],
  ['tsconfig.json'],
  [
    '.prettierrc',
    '.prettierrc.json',
    '.prettierrc.js',
    'prettier.config.js',
    'prettier.config.mjs',
    'prettier.config.cjs',
  ],
];

/** Marks a first-level directory as a package worth probing for its configs. */
export const PACKAGE_MANIFEST = 'package.json';

/**
 * First-level directories never probed for configs. Dot-directories are skipped
 * by prefix; these are the named ones that are checked out but not authored here.
 */
export const IGNORED_DIRS: readonly string[] = ['node_modules', 'dist', 'build', 'coverage'];

/** `ConventionScan.warnings` entry when repo-intel returned no ranked paths. */
export const NO_RANKED_SAMPLES_WARNING =
  'Ranked source samples were unavailable (repo-intel is off or the repo is not indexed) ' +
  '— only config files were analysed.';

/** 409 body for a repo we cannot sample at all (spec §2.4). */
export const REPO_NOT_INDEXED_CODE = 'repo_not_indexed';
export const REPO_NOT_INDEXED_MESSAGE =
  'No config files and no ranked source files were found for this repo. ' +
  'Index the repo first (Repo → Re-analyze), then run the scan again.';

// ---- The model call (spec §3) --------------------------------------------

/** System prompt template under `src/prompts/`. */
export const CONVENTIONS_SYSTEM_PROMPT = 'conventions.system.md';

/** Names the tool / json_schema of the one structured call per scan. */
export const CONVENTIONS_SCHEMA_NAME = 'ConventionExtraction';

/** Upper bound on the candidates the model may return. */
export const MAX_CANDIDATES = 30;

export const MODEL_TEMPERATURE = 0;
export const MODEL_MAX_TOKENS = 4_000;

// ---- Evidence verification (spec §4) -------------------------------------

/** A cited range must satisfy `end_line - start_line < MAX_EVIDENCE_SPAN`. */
export const MAX_EVIDENCE_SPAN = 40;

/** Line prefixes treated as comment-only (a range of these alone is dropped). */
export const COMMENT_PREFIXES = ['//', '/*', '*/', '*', '#', '<!--', '--', ';'] as const;

// ---- Persistence (spec §5) -----------------------------------------------

/** Statuses `GET /repos/:id/conventions` returns — `rejected` is never on the wire. */
export const VISIBLE_STATUSES: readonly ConventionStatus[] = ['pending', 'accepted'];

export const PENDING_STATUS: ConventionStatus = 'pending';
export const ACCEPTED_STATUS: ConventionStatus = 'accepted';
export const REJECTED_STATUS: ConventionStatus = 'rejected';

// ---- Accepted → skill (spec §6) ------------------------------------------

/** Default name of the merged skill; the user may edit it before posting back. */
export const DEFAULT_SKILL_NAME = 'repo-conventions';

/** Default `SkillType` of the merged skill. */
export const DEFAULT_SKILL_TYPE: SkillType = 'convention';

/** `skills.source` written for the merged skill — trusted in run-executor. */
export const EXTRACTED_SOURCE: SkillSource = 'extracted';

/** The one framing sentence the drafted body opens with. */
export const DRAFT_INTRO =
  'Flag changes that violate any rule below and cite the offending `file:line`.';

/** 409 for `GET …/draft` with nothing accepted yet. */
export const NO_ACCEPTED_CODE = 'no_accepted_conventions';
export const NO_ACCEPTED_MESSAGE =
  'Accept at least one convention candidate before creating a skill from them.';

/** Chars of a rule kept in its `## <slug>` heading. */
export const MAX_SLUG_CHARS = 60;
