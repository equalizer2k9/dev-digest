import type { EvalDiffLine, EvalRunSkill } from "@devdigest/shared";

/** The marker a prompt diff line starts with. */
export function diffPrefix(op: EvalDiffLine["op"]): string {
  return op === "add" ? "+" : op === "remove" ? "−" : " ";
}

export function skillLabel(skill: EvalRunSkill): string {
  return `${skill.name} v${skill.version}`;
}
