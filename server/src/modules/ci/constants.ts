/** Export to CI (SPEC-05) — fixed values of the `ci` module. */

export const CI_BRANCH = 'devdigest/ci';
export const CI_BASE_BRANCH = 'main';
export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_COMMIT_MESSAGE = 'Add DevDigest CI review';

export const WORKFLOW_NAME = 'DevDigest Review';
export const WORKFLOW_FILE = 'devdigest-review.yml';
export const WORKFLOW_PATH = `.github/workflows/${WORKFLOW_FILE}`;

export const ARTIFACT_NAME = 'devdigest-result';
export const ARTIFACT_FILE = 'devdigest-result.json';
export const ARTIFACT_RETENTION_DAYS = 7;
/** Cap on the inflated `devdigest-result.json` (zip-bomb guard). */
export const ARTIFACT_MAX_BYTES = 64 * 1024;

export const JOB_TIMEOUT_MINUTES = 10;
export const NODE_VERSION = 22;
export const RUNS_LIMIT = 30;

export const AGENTS_DIR = '.devdigest/agents';
export const SKILLS_DIR = '.devdigest/skills';
export const RUNNER_DIR = '.devdigest/runner';

/** Pinned third-party actions: commit SHA + the tag it was verified against (git ls-remote, 2026-10-16). */
export const ACTION_CHECKOUT = {
  uses: 'actions/checkout',
  sha: '3d3c42e5aac5ba805825da76410c181273ba90b1',
  tag: 'v7.0.1',
} as const;
export const ACTION_SETUP_NODE = {
  uses: 'actions/setup-node',
  sha: '949feb2413d6458794dcd2491c4babbbce0c15c1',
  tag: 'v7.1.0',
} as const;
export const ACTION_UPLOAD_ARTIFACT = {
  uses: 'actions/upload-artifact',
  sha: 'cf430e030ddbb5b0abf93d22962f4752f3646cd9',
  tag: 'v7.0.2',
} as const;

export const ERR_RUNNER_MISSING = 'ci_runner_missing';
export const ERR_MANIFEST_INVALID = 'ci_manifest_invalid';
export const ERR_REPO_TAKEN = 'ci_repo_taken';
export const ERR_WORKFLOW_PERMISSION = 'ci_workflow_permission';

export const RUNNER_BUILD_HINT = 'pnpm --dir agent-runner build';
