/**
 * Thrown by `OctokitGitHubClient.commitFiles` when GitHub refuses a write because the
 * token may not touch `.github/workflows/**` (classic `workflow` scope, fine-grained
 * `Workflows: write`). Detect with `isWorkflowPermission`.
 */
export class GitHubWorkflowPermissionError extends Error {
  readonly code = 'WORKFLOW_PERMISSION';
  constructor(detail: string) {
    super(detail);
    this.name = 'GitHubWorkflowPermissionError';
  }
}

export const isWorkflowPermission = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'WORKFLOW_PERMISSION';
