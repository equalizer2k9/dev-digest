import { describe, it, expect } from "vitest";
import { diffFragment, validateEdit } from "./helpers";

const DIFF = [
  "--- a/f.ts",
  "+++ b/f.ts",
  "@@ -1,3 +1,3 @@",
  " a",
  "-b",
  "+B",
  " c",
  "@@ -20,2 +20,3 @@",
  " x",
  "+y",
  " z",
].join("\n");

describe("validateEdit", () => {
  it("trims the name and parses the lines", () => {
    expect(validateEdit("  n  ", "3", "5")).toEqual({
      edit: { name: "n", start_line: 3, end_line: 5 },
      error: null,
    });
  });
  it.each([
    [" ", "1", "1", "nameEmpty"],
    ["x".repeat(201), "1", "1", "nameTooLong"],
    ["n", "a", "1", "lineInvalid"],
    ["n", "1", "", "lineInvalid"],
    ["n", "0", "3", "startMin"],
    ["n", "5", "4", "startAfterEnd"],
  ])("rejects %j %j %j as %s", (name, a, b, error) => {
    expect(validateEdit(name, a, b).error).toBe(error);
  });
  it("accepts a 200-character name and a one-line zone", () => {
    expect(validateEdit("x".repeat(200), "7", "7").error).toBeNull();
  });
});

describe("diffFragment", () => {
  it("keeps only the hunks the zone meets, without file headers", () => {
    const lines = diffFragment(DIFF, { start: 20, end: 21 });
    expect(lines.map((l) => l.text)).toEqual(["@@ -20,2 +20,3 @@", " x", "+y", " z"]);
  });
  it("marks lines by new-file number; removed lines never light up", () => {
    const lines = diffFragment(DIFF, { start: 2, end: 2 });
    expect(lines.map((l) => [l.text, l.highlighted])).toEqual([
      ["@@ -1,3 +1,3 @@", false],
      [" a", false],
      ["-b", false],
      ["+B", true],
      [" c", false],
    ]);
  });
  it("redraws for another zone", () => {
    const hl = (z: { start: number; end: number }) =>
      diffFragment(DIFF, z).filter((l) => l.highlighted).map((l) => l.text);
    expect(hl({ start: 1, end: 1 })).toEqual([" a"]);
    expect(hl({ start: 1, end: 3 })).toEqual([" a", "+B", " c"]);
  });
  it("a zone meeting no hunk gives nothing", () => {
    expect(diffFragment(DIFF, { start: 10, end: 12 })).toEqual([]);
  });
  it("a null zone keeps every hunk unmarked", () => {
    const lines = diffFragment(DIFF, null);
    expect(lines.filter((l) => l.kind === "hunk")).toHaveLength(2);
    expect(lines.some((l) => l.highlighted)).toBe(false);
  });
});
