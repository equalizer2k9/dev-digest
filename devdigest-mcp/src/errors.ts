import { ApiError, apiOrigin } from './api-client.js';
import { ELLIPSIS, MAX_ECHO, MAX_KNOWN, MAX_NAME, MAX_TEXT, SAFE_CODE_RE } from './constants.js';

/** Cuts `s` to at most `max` chars, ending in a visible marker when it was cut. */
export function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}

/**
 * A failure with fixed wording. `error` and `hint` are prose written here; anything that came from
 * the API goes into `details`, which the tool result carries as JSON field values.
 */
export class HintError extends Error {
  constructor(
    error: string,
    readonly hint: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(error);
    this.name = 'HintError';
  }
}

const names = (xs: string[]) => xs.slice(0, MAX_KNOWN).map((x) => clip(x, MAX_NAME));

export const unknownAgent = (x: string, known: string[]) =>
  new HintError('Agent not found.', 'Call list_agents and pass the name or id of one of known_agents.', {
    requested_agent: clip(x, MAX_ECHO),
    known_agents: names(known),
  });

export const unknownPr = (n: number, repo: string) =>
  new HintError(
    `PR #${n} not found in the repo.`,
    'Check the number with `gh pr list`; the PR must be imported in DevDigest.',
    { repo: clip(repo, MAX_NAME) },
  );

export const unknownRepo = (x: string | undefined, known: string[]) =>
  new HintError('Repo is not imported or not given.', 'Pass repo as owner/name, one of known_repos.', {
    requested_repo: x === undefined ? null : clip(x, MAX_ECHO),
    known_repos: names(known),
  });

export const noReview = (n: number) =>
  new HintError(`No review for PR #${n} yet.`, 'Call run_agent_on_pr first.');

/** `error` is the run's failure text from the API (or null when there is none to show). */
export const runFailed = (error?: string) =>
  new HintError('Run failed.', 'Fix the cause (see run_error) and call run_agent_on_pr again.', {
    run_error: error === undefined ? null : clip(error, MAX_TEXT),
  });

export const noConventions = (repo: string) =>
  new HintError(
    'No accepted conventions for the repo.',
    'Open its Conventions page in DevDigest, run a scan and accept rules.',
    { repo: clip(repo, MAX_NAME) },
  );

export interface ToolResult {
  [key: string]: unknown;
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

/** Any thrown failure → `isError: true`, one JSON object `{ error, hint, …data fields }`. */
export function toToolError(err: unknown): ToolResult {
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(failureFor(err)) }] };
}

function failureFor(err: unknown): Record<string, unknown> {
  if (err instanceof HintError) return { error: err.message, hint: err.hint, ...err.details };
  if (err instanceof ApiError) {
    if (err.code === 'network_error') {
      return {
        error: `DevDigest API is not reachable at ${apiOrigin()}.`,
        hint: 'Start it from the repo root with ./scripts/dev.sh (or `pnpm dev` in server/), then retry. Set DEVDIGEST_API_URL if the API runs elsewhere.',
      };
    }
    if (err.status === 429) {
      return { error: 'Rate limited (10 review starts per minute).', hint: 'Wait a minute and retry.' };
    }
    // The API's own message is never repeated; its code only if it is a plain snake_case token.
    return {
      error: 'DevDigest API returned an error.',
      status: err.status,
      ...(SAFE_CODE_RE.test(err.code) ? { code: err.code } : {}),
      hint: `Check the arguments and that the API at ${apiOrigin()} is healthy, then retry.`,
    };
  }
  console.error('devdigest-mcp: unexpected error', err);
  return {
    error: 'Unexpected error in devdigest-mcp.',
    hint: 'Details are in the server log on stderr. Retry; if it persists, restart the MCP server.',
  };
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
