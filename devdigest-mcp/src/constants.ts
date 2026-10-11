export const DEFAULT_API_URL = 'http://localhost:3001';
/** run_agent_on_pr blocks at most this long, then returns "still running". */
export const RUN_TIMEOUT_MS = 120_000;
export const POLL_INTERVAL_MS = 2_000;
/** One HTTP call to the API; a hang becomes a network_error. */
export const REQUEST_TIMEOUT_MS = 15_000;
