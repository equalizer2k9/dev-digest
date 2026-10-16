/**
 * Pure: a workflow case's pass/fail from its trace — the record outcome the repeat summary counts.
 *   pnpm vitest run src/dsl/workflow-pass.test.ts
 */

import { describe, expect, test } from "vitest";
import type { WorkflowCase } from "./case.js";
import { workflowPassed } from "./workflow-pass.js";

const trace = (t: Partial<{ subagents: string[]; skillsInvoked: string[]; filesRead: string[]; isError: boolean }>) => ({
  subagents: [],
  skillsInvoked: [],
  filesRead: [],
  isError: false,
  ...t,
});

describe("workflowPassed", () => {
  test("activation: a skill call counts even when the session then hits maxTurns (isError)", () => {
    const c: WorkflowCase = { kind: "activation", name: "a", prompt: "p", skill: "engineering-insights", shouldActivate: true };
    expect(workflowPassed(c, trace({ skillsInvoked: ["engineering-insights"], isError: true }))).toBe(true);
    expect(workflowPassed(c, trace({}))).toBe(false);
    expect(workflowPassed({ ...c, shouldActivate: false }, trace({}))).toBe(true);
  });

  test("contrast: a clean session that read nothing fails the treatment and passes the control", () => {
    const c: WorkflowCase = { kind: "contrast", name: "c", prompt: "p", expectFileRead: "docs/agent-prompts/README.md" };
    const none = trace({});
    const hit = trace({ filesRead: ["/repo/docs/agent-prompts/README.md"] });
    expect(workflowPassed(c, none, "treatment")).toBe(false);
    expect(workflowPassed(c, hit, "treatment")).toBe(true);
    expect(workflowPassed(c, none, "control")).toBe(true);
    expect(workflowPassed(c, hit, "control")).toBe(false);
  });

  test("dispatch and trace check the subagent and every expected read", () => {
    const d: WorkflowCase = { kind: "dispatch", name: "d", prompt: "p", expectSubagent: "architecture-reviewer" };
    expect(workflowPassed(d, trace({ subagents: ["architecture-reviewer"] }))).toBe(true);
    expect(workflowPassed(d, trace({ subagents: ["researcher"] }))).toBe(false);
    const t: WorkflowCase = { kind: "trace", name: "t", prompt: "p", expectFilesRead: ["server/AGENTS.md"] };
    expect(workflowPassed(t, trace({ filesRead: ["/repo/server/src/x.ts"] }))).toBe(false);
    expect(workflowPassed(t, trace({ filesRead: ["/repo/server/AGENTS.md"] }))).toBe(true);
  });
});
