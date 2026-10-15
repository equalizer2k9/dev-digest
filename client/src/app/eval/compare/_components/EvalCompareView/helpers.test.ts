import { describe, it, expect } from "vitest";
import { diffPrefix, skillLabel } from "./helpers";

describe("diffPrefix", () => {
  it("maps each op to its line marker", () => {
    expect(diffPrefix("add")).toBe("+");
    expect(diffPrefix("remove")).toBe("−");
    expect(diffPrefix("context")).toBe(" ");
  });
});

describe("skillLabel", () => {
  it("is name and version", () => {
    expect(skillLabel({ name: "sql", version: 3 })).toBe("sql v3");
  });
});
