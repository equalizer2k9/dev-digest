/** Eval module constants. */

/** Stable error codes (the client maps these to text). */
export const EVAL_CASE_UNDECIDED = 'eval_case_undecided';
export const EVAL_CASE_NO_AGENT = 'eval_case_no_agent';
export const EVAL_CASE_NO_PATCH = 'eval_case_no_patch';
export const EVAL_CASE_NO_HUNK = 'eval_case_no_hunk';
export const EVAL_CASE_CONFLICT = 'eval_case_conflict';
export const EVAL_RUN_IN_PROGRESS = 'eval_run_in_progress';
export const EVAL_SET_EMPTY = 'eval_set_empty';
export const EVAL_COMPARE_INVALID = 'eval_compare_invalid';

/** `eval_runs.error` of a run that was still `running` when the process restarted. */
export const RUN_INTERRUPTED = 'interrupted';

/** Rows on the dashboard's recent-runs list. */
export const RECENT_RUNS = 10;

/** A case's error reason is cut to this many characters before it is stored. */
export const MAX_ERROR_CHARS = 500;

/** LCS size cap for the prompt line diff; above it the diff replaces everything. */
export const MAX_DIFF_CELLS = 4_000_000;

/** Postgres unique-violation SQLSTATE. */
export const PG_UNIQUE_VIOLATION = '23505';
