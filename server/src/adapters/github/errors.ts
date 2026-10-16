// The error lives in platform/errors so services can catch it without importing adapter code.
export { GitHubWorkflowPermissionError, isWorkflowPermission } from '../../platform/errors.js';
