import { describe, it, expect } from "vitest";
import type { ProjectContextDocument } from "@devdigest/shared";
import { previewPathFor, previewStatus } from "./helpers";

const doc = (path: string, too_large = false): ProjectContextDocument => ({
  path,
  tag: "docs",
  tokens: too_large ? null : 1,
  too_large,
  used_by: 0,
});
const docs = [doc("a.md"), doc("big.md", true)];
const q = (over: Partial<Parameters<typeof previewStatus>[2]> = {}) => ({
  isLoading: false,
  isError: false,
  error: null,
  data: undefined,
  ...over,
});

describe("previewPathFor", () => {
  it("requests a selected, normal document only", () => {
    expect(previewPathFor(null, docs)).toBeNull();
    expect(previewPathFor("big.md", docs)).toBeNull();
    expect(previewPathFor("a.md", docs)).toBe("a.md");
  });
});

describe("previewStatus", () => {
  it("maps selection and query state", () => {
    expect(previewStatus(null, docs, q())).toBe("idle");
    expect(previewStatus("big.md", docs, q())).toBe("tooLarge");
    expect(previewStatus("a.md", docs, q({ isLoading: true }))).toBe("loading");
    expect(previewStatus("a.md", docs, q({ isError: true, error: { status: 413 } }))).toBe("tooLarge");
    expect(previewStatus("a.md", docs, q({ isError: true, error: { status: 500 } }))).toBe("error");
    expect(previewStatus("a.md", docs, q({ data: { content: "x" } }))).toBe("ready");
    expect(previewStatus("a.md", docs, q())).toBe("loading");
  });
});
