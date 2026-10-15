import { ApiError } from "../../../../../../../lib/api";

const KNOWN_CODES = [
  "eval_case_undecided",
  "eval_case_no_agent",
  "eval_case_no_patch",
  "eval_case_no_hunk",
  "eval_case_conflict",
] as const;

/** Message key (under `turnInto.errors`) for an API error code; unknown codes → `generic`. */
export function errorKey(code: string | undefined): string {
  return (KNOWN_CODES as readonly string[]).includes(code ?? "") ? code! : "generic";
}

/** The conflicting case's name carried by a 409, if any. */
export function conflictName(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const d = err.details as { case_name?: unknown } | null | undefined;
  return typeof d?.case_name === "string" ? d.case_name : undefined;
}
