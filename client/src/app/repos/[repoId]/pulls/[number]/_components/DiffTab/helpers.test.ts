import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiffGroup } from "@devdigest/shared";
import { countFilesWithFindings, findingsByPath, groupFiles } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+x" });
const smart = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const finding = (id: string, path: string): FindingRecord => ({
  id,
  severity: "WARNING",
  category: "bug",
  title: id,
  file: path,
  start_line: 1,
  end_line: 1,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
});

describe("groupFiles", () => {
  const files = [file("a.ts"), file("b.md"), file("c.lock"), file("d.ts")];
  const groups: SmartDiffGroup[] = [
    { role: "core", files: [smart("d.ts"), smart("a.ts")] },
    { role: "tests", files: [] },
    { role: "boilerplate", files: [smart("c.lock")] },
  ];

  it("keeps the response order of groups and of files inside a group", () => {
    const out = groupFiles(groups, files);
    expect(out.groups.map((g) => g.role)).toEqual(["core", "tests", "boilerplate"]);
    expect(out.groups[0]!.files.map((f) => f.path)).toEqual(["d.ts", "a.ts"]);
    expect(out.groups[1]!.files).toEqual([]);
  });

  it("appends files the response does not mention as `rest`, in pr.files order", () => {
    expect(groupFiles(groups, files).rest.map((f) => f.path)).toEqual(["b.md"]);
  });

  it("skips a response path that has no PrFile", () => {
    const out = groupFiles([{ role: "core", files: [smart("ghost.ts"), smart("a.ts")] }], files);
    expect(out.groups[0]!.files.map((f) => f.path)).toEqual(["a.ts"]);
  });
});

describe("findingsByPath / countFilesWithFindings", () => {
  it("counts a file with two findings once", () => {
    const byPath = findingsByPath([finding("1", "a.ts"), finding("2", "a.ts"), finding("3", "b.ts")]);
    expect(byPath.get("a.ts")).toHaveLength(2);
    expect(countFilesWithFindings([file("a.ts"), file("b.ts"), file("c.ts")], byPath)).toBe(2);
  });

  it("is 0 with no findings, and ignores findings of files outside the list", () => {
    expect(countFilesWithFindings([file("a.ts")], findingsByPath([]))).toBe(0);
    expect(countFilesWithFindings([file("a.ts")], findingsByPath([finding("1", "zzz.ts")]))).toBe(0);
  });
});
