import { ApiError, apiUrl } from './api-client.js';

/** A failure whose message is already the hint for the next step. */
export class HintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HintError';
  }
}

export const unknownAgent = (x: string, names: string[]) =>
  new HintError(`Agent '${x}' not found. Call list_agents and pass one of: ${names.join(', ') || '(none configured)'}.`);

export const unknownPr = (n: number, repo: string) =>
  new HintError(
    `PR #${n} not found in ${repo}. Check the number with \`gh pr list\`; the PR must be imported in DevDigest.`,
  );

export const unknownRepo = (x: string | undefined, known: string[]) =>
  new HintError(
    `Repo '${x ?? '(none given)'}' is not imported. Known repos: ${known.join(', ') || '(none)'}. Pass repo as owner/name.`,
  );

export const noReview = (n: number) =>
  new HintError(`No review for PR #${n} yet. Call run_agent_on_pr first.`);

export const runFailed = (error: string) =>
  new HintError(`Run failed: ${error}. Fix the cause and call run_agent_on_pr again.`);

export const noConventions = (repo: string) =>
  new HintError(
    `No accepted conventions for ${repo}. Open its Conventions page in DevDigest, run a scan and accept rules.`,
  );

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Any thrown failure → `isError: true` with a message that names the next step. */
export function toToolError(err: unknown): ToolResult {
  return { isError: true, content: [{ type: 'text', text: messageFor(err) }] };
}

function messageFor(err: unknown): string {
  if (err instanceof HintError) return err.message;
  if (err instanceof ApiError) {
    if (err.code === 'network_error') {
      return `DevDigest API is not reachable at ${apiUrl()}. Start it with ./scripts/dev.sh, then retry.`;
    }
    if (err.status === 429) {
      return 'Rate limited (10 review starts per minute). Wait a minute and retry.';
    }
    return `DevDigest API error (${err.status} ${err.code}): ${err.message}. Check the arguments and that the API at ${apiUrl()} is healthy, then retry.`;
  }
  console.error('devdigest-mcp: unexpected error', err);
  return 'Unexpected error in devdigest-mcp (details in the server log on stderr). Retry; if it persists, restart the MCP server.';
}

/** Runs a tool body; success → one compact JSON text block, failure → toToolError. */
export async function runTool(body: () => Promise<unknown>): Promise<ToolResult> {
  try {
    const data = await body();
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return toToolError(err);
  }
}
