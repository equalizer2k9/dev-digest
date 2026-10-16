/**
 * Domain error taxonomy + structured API error envelope. The UX taxonomy
 * (toast/inline/full-screen) is the frontend's concern; the API returns a
 * stable structured body (ApiErrorBody): { error: { code, message, details } }.
 */

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found', details?: unknown) {
    super('not_found', message, 404, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super('validation_error', message, 422, details);
  }
}

export class ExternalServiceError extends AppError {
  constructor(message: string, details?: unknown) {
    super('external_service_error', message, 502, details);
  }
}

export class ConfigError extends AppError {
  constructor(message: string, details?: unknown) {
    super('config_error', message, 500, details);
  }
}

/**
 * Thrown by a GitHubClient adapter's `commitFiles` when GitHub refuses a write because the
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
