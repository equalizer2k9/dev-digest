import type { Result } from "../runtime/run-claude.js";
import type { WorkflowCase } from "./case.js";

type Trace = Pick<Result, "subagents" | "skillsInvoked" | "filesRead" | "isError">;

/** Did a skill engage? Either an explicit Skill tool-call, or reading its SKILL.md. */
export function activated(t: Pick<Trace, "skillsInvoked" | "filesRead">, skill: string): boolean {
  const bySkill = t.skillsInvoked.some((s) => s === skill || s.endsWith(`:${skill}`));
  return bySkill || t.filesRead.some((f) => f.includes(`skills/${skill}/SKILL.md`));
}

/**
 * A workflow case's assertion as a pure function of one trace — what `record()` stores as the
 * outcome, so the repeat summary counts the case, not "the session didn't error". A contrast case
 * records two rows: the treatment must read the file, the control must not.
 */
export function workflowPassed(c: WorkflowCase, t: Trace, role?: "treatment" | "control"): boolean {
  const read = (file: string) => t.filesRead.some((f) => f.includes(file));
  if (c.kind === "dispatch") return t.subagents.includes(c.expectSubagent);
  if (c.kind === "activation") return activated(t, c.skill) === c.shouldActivate;
  if (c.kind === "contrast") return read(c.expectFileRead) === (role !== "control");
  return (
    (c.expectSubagents ?? []).every((s) => t.subagents.includes(s)) &&
    (c.expectSkills ?? []).every((s) => activated(t, s)) &&
    (c.expectFilesRead ?? []).every(read) &&
    !t.isError
  );
}
