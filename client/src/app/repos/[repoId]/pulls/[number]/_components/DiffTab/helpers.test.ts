import { describe, it, expect } from "vitest";
import type { PrFile, SmartDiffGroup } from "@devdigest/shared";
import { countFilesWithFindings, groupFiles, pathsWithFindings } from "./helpers";

const file = (path: string): PrFile => ({ path, additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+x" });
const smart = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });

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

describe("pathsWithFindings / countFilesWithFindings", () => {
  const withLines = (path: string, lines: number[]) => ({ ...smart(path), finding_lines: lines });
  const groups: SmartDiffGroup[] = [
    { role: "core", files: [withLines("a.ts", [3, 9]), withLines("b.ts", []), withLines("c.ts", [1])] },
    { role: "tests", files: [withLines("d.test.ts", [])] },
  ];

  it("takes exactly the files whose finding_lines is non-empty", () => {
    expect([...pathsWithFindings(groups)].sort()).toEqual(["a.ts", "c.ts"]);
  });

  it("counts a file with several finding lines once", () => {
    const set = pathsWithFindings(groups);
    expect(countFilesWithFindings([file("a.ts"), file("b.ts"), file("c.ts")], set)).toBe(2);
  });

  it("is 0 with no findings, and ignores paths outside the list", () => {
    expect(countFilesWithFindings([file("a.ts")], new Set())).toBe(0);
    expect(countFilesWithFindings([file("a.ts")], new Set(["zzz.ts"]))).toBe(0);
  });
});
