import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "./nav";

const item = NAV.flatMap((g) => g.items).find((i) => i.key === "conventions");
const skillsLab = NAV.find((g) => g.section === "SKILLS LAB");
const workspace = NAV.find((g) => g.section === "WORKSPACE");

const contextItem = workspace?.items.find((i) => i.key === "context");

describe("nav — Project Context", () => {
  it("follows Pull Requests in WORKSPACE", () => {
    expect(workspace?.items.map((i) => i.key)).toEqual(["pulls", "context", "multi-agent"]);
  });

  it("carries the label and the repo-scoped href, with no g-chord", () => {
    expect(contextItem).toMatchObject({
      label: "Project Context",
      icon: "Folder",
      href: "/repos/:repoId/context",
    });
    expect(contextItem?.gKey).toBeUndefined();
  });

  it("resolves :repoId against the active repo", () => {
    expect(resolveHref(contextItem!.href, "repo-42")).toBe("/repos/repo-42/context");
  });
});

describe("nav — Conventions", () => {
  it("sits under the SKILLS LAB heading, not WORKSPACE", () => {
    expect(skillsLab?.items.map((i) => i.key)).toContain("conventions");
    expect(workspace?.items.map((i) => i.key)).not.toContain("conventions");
  });

  it("lists Skills, Agents, Conventions, then Eval Dashboard", () => {
    expect(skillsLab?.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions", "eval"]);
  });

  it("carries the label, icon and g-chord the spec names", () => {
    expect(item).toMatchObject({
      label: "Conventions",
      icon: "ListChecks",
      href: "/repos/:repoId/conventions",
      gKey: "c",
    });
  });

  it("resolves :repoId against the active repo", () => {
    expect(resolveHref(item!.href, "repo-42")).toBe("/repos/repo-42/conventions");
  });

  it("falls back to the placeholder segment with no active repo", () => {
    // Same behaviour as /repos/_/pulls — the page then shows RepoNotFound.
    expect(resolveHref(item!.href, null)).toBe("/repos/_/conventions");
  });

  it("registers the `g c` shortcut", () => {
    expect(SHORTCUTS).toEqual(
      expect.arrayContaining([{ keys: "g c", label: "Go to Conventions", group: "Navigation" }]),
    );
  });
});

describe("nav — Eval Dashboard", () => {
  const evalItem = skillsLab?.items.find((i) => i.key === "eval");

  it("sits in SKILLS LAB after Conventions with the label and href, no g-chord", () => {
    expect(evalItem).toMatchObject({ label: "Eval Dashboard", icon: "FlaskConical", href: "/eval" });
    expect(evalItem?.gKey).toBeUndefined();
    expect(skillsLab?.items.at(-1)?.key).toBe("eval");
  });

  it("is not repo-scoped", () => {
    expect(resolveHref(evalItem!.href, "repo-42")).toBe("/eval");
  });
});

describe("nav — CI Runs", () => {
  const ci = NAV.find((g) => g.section === "CI");

  it("has its own CI group with the label and href, not repo-scoped, no g-chord", () => {
    expect(ci?.items[0]).toEqual({ key: "ci-runs", label: "CI Runs", icon: "Activity", href: "/ci-runs" });
    expect(resolveHref(ci!.items[0]!.href, "repo-42")).toBe("/ci-runs");
  });

  it("lists Agent Performance after CI Runs: workspace-wide, no g-chord", () => {
    expect(ci?.items.map((i) => i.key)).toEqual(["ci-runs", "agent-performance"]);
    const perf = ci!.items[1]!;
    expect(perf).toEqual({
      key: "agent-performance",
      label: "Agent Performance",
      icon: "BarChart",
      href: "/agent-performance",
    });
    expect(perf.gKey).toBeUndefined();
    expect(resolveHref(perf.href, "repo-42")).toBe("/agent-performance");
  });
});

describe("nav — Multi-Agent Review", () => {
  it("is a workspace-wide WORKSPACE item with no repo token and no g-chord", () => {
    const it = workspace?.items.find((i) => i.key === "multi-agent");
    expect(it).toMatchObject({ label: "Multi-Agent Review", icon: "Layers", href: "/multi-agent" });
    expect(it?.gKey).toBeUndefined();
  });
});
