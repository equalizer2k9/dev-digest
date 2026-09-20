import { describe, it, expect } from "vitest";
import { diffLines, isIdentical } from "./helpers";

describe("diffLines", () => {
  it("marks unchanged lines as context", () => {
    const out = diffLines("a\nb\nc", "a\nb\nc");
    expect(out.map((l) => l.op)).toEqual(["context", "context", "context"]);
    expect(isIdentical(out)).toBe(true);
  });

  it("marks a line only in the current body as added", () => {
    const out = diffLines("a\nc", "a\nb\nc");
    expect(out).toEqual([
      { op: "context", text: "a" },
      { op: "add", text: "b" },
      { op: "context", text: "c" },
    ]);
    expect(isIdentical(out)).toBe(false);
  });

  it("marks a line only in the old version as removed", () => {
    const out = diffLines("a\nb\nc", "a\nc");
    expect(out).toEqual([
      { op: "context", text: "a" },
      { op: "remove", text: "b" },
      { op: "context", text: "c" },
    ]);
  });

  it("renders a replaced line as one removal and one addition", () => {
    const out = diffLines("keep\nold", "keep\nnew");
    expect(out.filter((l) => l.op === "remove").map((l) => l.text)).toEqual(["old"]);
    expect(out.filter((l) => l.op === "add").map((l) => l.text)).toEqual(["new"]);
  });

  it("handles an empty old body", () => {
    expect(diffLines("", "x")).toEqual([
      { op: "remove", text: "" },
      { op: "add", text: "x" },
    ]);
  });
});
