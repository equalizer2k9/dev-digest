import { describe, it, expect } from "vitest";
import type { ProjectContextDocument } from "@devdigest/shared";
import { buildTree, totalTokens } from "./helpers";

const doc = (path: string, extra: Partial<ProjectContextDocument> = {}): ProjectContextDocument => ({
  path,
  tag: "docs",
  tokens: 10,
  too_large: false,
  used_by: 0,
  ...extra,
});

describe("buildTree", () => {
  it("nests documents into folders, keeping the given order", () => {
    const tree = buildTree([doc("docs/a.md"), doc("docs/sub/b.md"), doc("pkg/specs/c.md")]);
    expect(tree).toEqual([
      {
        kind: "folder",
        name: "docs",
        path: "docs",
        children: [
          { kind: "doc", name: "a.md", doc: expect.objectContaining({ path: "docs/a.md" }) },
          {
            kind: "folder",
            name: "sub",
            path: "docs/sub",
            children: [{ kind: "doc", name: "b.md", doc: expect.objectContaining({ path: "docs/sub/b.md" }) }],
          },
        ],
      },
      {
        kind: "folder",
        name: "pkg",
        path: "pkg",
        children: [
          {
            kind: "folder",
            name: "specs",
            path: "pkg/specs",
            children: [{ kind: "doc", name: "c.md", doc: expect.objectContaining({ path: "pkg/specs/c.md" }) }],
          },
        ],
      },
    ]);
  });

  it("is empty for no documents", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("totalTokens", () => {
  it("skips null", () => {
    expect(totalTokens([doc("a.md", { tokens: 5 }), doc("b.md", { tokens: null }), doc("c.md", { tokens: 7 })])).toBe(12);
  });
});
