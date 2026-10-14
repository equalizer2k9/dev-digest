import { describe, it, expect } from "vitest";
import { visiblePath } from "./visible-path";

describe("visiblePath", () => {
  it("leaves a plain path alone", () => {
    expect(visiblePath("docs/a.md")).toBe("docs/a.md");
  });
  it("writes bidi, zero-width and control characters as escapes", () => {
    expect(visiblePath("docs/a\u202Eb\n.md")).toBe("docs/a\\u{202e}b\\u{a}.md");
    expect(visiblePath("a\u2028b\u200Bc")).toBe("a\\u{2028}b\\u{200b}c");
  });
});
