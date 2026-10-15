import type { EvalExpectation, EvalRunRecord } from "@devdigest/shared";

/** Newest completed run (`runs` is newest first); a newer running or failed run is skipped. */
export function latestCompleted(runs: EvalRunRecord[]): EvalRunRecord | null {
  return runs.find((r) => r.status === "completed") ?? null;
}

/** The newest run, only when it is running or failed — what the status line reports. */
export function statusLineRun(runs: EvalRunRecord[]): EvalRunRecord | null {
  const newest = runs[0];
  return newest && newest.status !== "completed" ? newest : null;
}

/** `file:start-end`, or `file:line` for a one-line zone. */
export function caseLocation(exp: Pick<EvalExpectation, "file" | "start_line" | "end_line">): string {
  return exp.start_line === exp.end_line
    ? `${exp.file}:${exp.start_line}`
    : `${exp.file}:${exp.start_line}-${exp.end_line}`;
}
