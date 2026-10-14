import { describe, it, expect } from "vitest";
import type { ProjectContextDocument, ProjectContextEffective } from "@devdigest/shared";
import { buildRows, filterRows, moveItem, sumTokens } from "./helpers";

const doc = (path: string, extra: Partial<ProjectContextDocument> = {}): ProjectContextDocument => ({
  path,
  tag: "docs",
  tokens: 10,
  too_large: false,
  used_by: 0,
  ...extra,
});
const eff = (
  path: string,
  extra: Partial<ProjectContextEffective> = {},
): ProjectContextEffective => ({ path, tokens: 10, skip_reason: null, skill: null, ...extra });

describe("buildRows", () => {
  it("orders attached (stored order), then skill-only, then the rest", () => {
    const rows = buildRows({
      documents: [doc("docs/a.md"), doc("docs/b.md"), doc("docs/c.md"), doc("docs/d.md")],
      attached: ["docs/c.md", "docs/a.md"],
      effective: [
        eff("docs/c.md"),
        eff("docs/a.md"),
        eff("docs/d.md", { skill: { id: "s1", name: "Rubric" } }),
      ],
    });
    expect(rows.map((r) => [r.path, r.kind])).toEqual([
      ["docs/c.md", "attached"],
      ["docs/a.md", "attached"],
      ["docs/d.md", "skill"],
      ["docs/b.md", "other"],
    ]);
    expect(rows[2]?.skillName).toBe("Rubric");
  });

  it("keeps an attached path that is not in documents, with the effective reason", () => {
    const rows = buildRows({
      documents: [],
      attached: ["docs/gone.md"],
      effective: [eff("docs/gone.md", { tokens: null, skip_reason: "missing" })],
    });
    expect(rows).toEqual([
      expect.objectContaining({ path: "docs/gone.md", kind: "attached", tag: null, reason: "missing" }),
    ]);
  });

  it("falls back to the document's too_large flag for a row with no effective entry", () => {
    const [row] = buildRows({
      documents: [doc("docs/big.md", { too_large: true, tokens: null })],
      attached: [],
      effective: [],
    });
    expect(row?.reason).toBe("too_large");
  });
});

describe("filterRows", () => {
  const rows = buildRows({
    documents: [doc("docs/Architecture.md"), doc("docs/other.md")],
    attached: [],
    effective: [],
  });
  it("matches a path substring, ignoring case", () => {
    expect(filterRows(rows, "ARCH").map((r) => r.path)).toEqual(["docs/Architecture.md"]);
  });
  it("returns everything for a blank query", () => {
    expect(filterRows(rows, "  ")).toHaveLength(2);
  });
});

describe("sumTokens", () => {
  it("treats null as 0", () => {
    expect(sumTokens([eff("a", { tokens: 5 }), eff("b", { tokens: null }), eff("c", { tokens: 7 })])).toBe(12);
  });
});

describe("moveItem", () => {
  it("swaps with the neighbour and ignores out-of-range moves", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    const same = ["a", "b"];
    expect(moveItem(same, 0, -1)).toBe(same);
  });
});
