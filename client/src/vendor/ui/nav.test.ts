import { describe, it, expect } from "vitest";
import { NAV, SHORTCUTS, resolveHref } from "./nav";

const item = NAV.flatMap((g) => g.items).find((i) => i.key === "conventions");
const skillsLab = NAV.find((g) => g.section === "SKILLS LAB");
const workspace = NAV.find((g) => g.section === "WORKSPACE");

describe("nav — Conventions", () => {
  it("sits under the SKILLS LAB heading, not WORKSPACE", () => {
    expect(skillsLab?.items.map((i) => i.key)).toContain("conventions");
    expect(workspace?.items.map((i) => i.key)).not.toContain("conventions");
  });

  it("follows Skills and Agents in that section", () => {
    expect(skillsLab?.items.map((i) => i.key)).toEqual(["skills", "agents", "conventions"]);
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
