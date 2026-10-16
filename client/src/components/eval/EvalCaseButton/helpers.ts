import { ApiError } from "../../../lib/api";

const KNOWN_CODES = [
  "eval_case_undecided",
  "eval_case_no_agent",
  "eval_case_no_patch",
  "eval_case_no_hunk",
  "eval_case_bad_name",
  "eval_case_bad_zone",
  "eval_case_conflict",
  "validation_error",
] as const;

/** Message key (under `turnInto.errors`) for an API error code; unknown codes → `fallback`. */
export function errorKey(
  code: string | undefined,
  fallback: "generic" | "runGeneric" | "updateGeneric" = "generic",
): string {
  return (KNOWN_CODES as readonly string[]).includes(code ?? "") ? code! : fallback;
}

/** Codes that mean "this finding cannot become a case" (AC-5, AC-46): the modal shows them instead of a form. */
export const REFUSAL_CODES = ["eval_case_undecided", "eval_case_no_agent", "eval_case_no_patch"] as const;

export function isRefusal(code: string | undefined): boolean {
  return (REFUSAL_CODES as readonly string[]).includes(code ?? "");
}

/** The conflicting case's name carried by a 409, if any. */
export function conflictName(err: unknown): string | undefined {
  if (!(err instanceof ApiError)) return undefined;
  const d = err.details as { case_name?: unknown } | null | undefined;
  return typeof d?.case_name === "string" ? d.case_name : undefined;
}
