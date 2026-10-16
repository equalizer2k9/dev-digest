import { describe, it, expect } from "vitest";
import { canContinue, installBody, previewBody, type WizardState } from "./helpers";

const base: WizardState = {
  repoId: "r1",
  triggers: ["opened", "synchronize"],
  postAs: "github_review",
  fileCount: 4,
  previewFailed: false,
  editedWorkflow: null,
};

describe("canContinue", () => {
  it.each([
    ["target without a repo", 0, { repoId: null }, false],
    ["target with a repo", 0, {}, true],
    ["preview without files", 1, { fileCount: 0 }, false],
    ["preview with an error", 1, { previewFailed: true }, false],
    ["preview with files", 1, {}, true],
    ["configure without triggers", 2, { triggers: [] }, false],
    ["configure with one trigger", 2, { triggers: ["reopened"] }, true],
    ["install has no continue", 3, {}, false],
  ] as const)("%s", (_n, step, patch, expected) => {
    expect(canContinue(step, { ...base, ...patch } as WizardState)).toBe(expected);
  });
});

describe("installBody", () => {
  it("omits workflow when it was not edited", () => {
    const body = installBody(base);
    expect(body).toEqual({ repo_id: "r1", triggers: ["opened", "synchronize"], post_as: "github_review" });
    expect("workflow" in body).toBe(false);
  });
  it("adds workflow when it was edited", () => {
    expect(installBody({ ...base, editedWorkflow: "name: x" }).workflow).toBe("name: x");
  });
  it("previewBody never carries workflow", () => {
    expect("workflow" in previewBody({ ...base, editedWorkflow: "name: x" })).toBe(false);
  });
});
