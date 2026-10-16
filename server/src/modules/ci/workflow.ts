import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import {
  ACTION_CHECKOUT,
  ACTION_SETUP_NODE,
  ACTION_UPLOAD_ARTIFACT,
  ARTIFACT_FILE,
  ARTIFACT_NAME,
  ARTIFACT_RETENTION_DAYS,
  JOB_TIMEOUT_MINUTES,
  NODE_VERSION,
  RUNNER_DIR,
  WORKFLOW_NAME,
} from './constants.js';

const pin = (a: { uses: string; sha: string; tag: string }): string => `${a.uses}@${a.sha} # ${a.tag}`;

const SAME_REPO = 'github.event.pull_request.head.repo.full_name == github.repository';
const FORK = 'github.event.pull_request.head.repo.full_name != github.repository';

/**
 * The GitHub Actions workflow of the CI bundle (pure, string template).
 * Hardened: base-SHA checkout without credentials, two secrets only, pinned
 * actions, and no `${{ }}` inside any `run:` — values reach commands through
 * `env:` and step outputs only.
 */
export function buildWorkflow(triggers: CiTrigger[], postAs: CiPostAs): string {
  return `name: ${WORKFLOW_NAME}

on:
  pull_request:
    types: [${triggers.join(', ')}]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: devdigest-review-\${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    runs-on: ubuntu-latest
    timeout-minutes: ${JOB_TIMEOUT_MINUTES}
    steps:
      - name: Skip notice for fork pull requests
        if: \${{ ${FORK} }}
        run: echo "::notice::DevDigest review skipped - pull requests from forks have no access to repository secrets."

      - name: Checkout base commit
        if: \${{ ${SAME_REPO} }}
        uses: ${pin(ACTION_CHECKOUT)}
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false

      - name: Check for the DevDigest runner
        id: runner
        if: \${{ ${SAME_REPO} }}
        run: |
          if [ -f ${RUNNER_DIR}/index.js ]; then
            echo "present=true" >> "$GITHUB_OUTPUT"
          else
            echo "::notice::DevDigest runner not found on the base branch - merge the DevDigest CI pull request first."
            echo "present=false" >> "$GITHUB_OUTPUT"
          fi

      - name: Set up Node
        if: \${{ steps.runner.outputs.present == 'true' }}
        uses: ${pin(ACTION_SETUP_NODE)}
        with:
          node-version: ${NODE_VERSION}

      - name: Run DevDigest review
        if: \${{ steps.runner.outputs.present == 'true' }}
        run: node ${RUNNER_DIR}/index.js
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_POST_AS: ${postAs}

      - name: Upload result
        if: \${{ always() && steps.runner.outputs.present == 'true' }}
        uses: ${pin(ACTION_UPLOAD_ARTIFACT)}
        with:
          name: ${ARTIFACT_NAME}
          path: ${ARTIFACT_FILE}
          retention-days: ${ARTIFACT_RETENTION_DAYS}
          if-no-files-found: ignore
`;
}
