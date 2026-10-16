import { describe, expect, it } from "vitest";
import { formatCost } from "./cost";

describe("formatCost", () => {
  it("keeps a sub-cent cost visible instead of printing $0.000", () => {
    expect(formatCost(0.00049714)).toBe("$0.0005");
  });
  it("3 decimals below $1, 2 above, and zero stays $0.000", () => {
    expect(formatCost(0.0123)).toBe("$0.012");
    expect(formatCost(12.345)).toBe("$12.35");
    expect(formatCost(0)).toBe("$0.000");
  });
  it("an unknown cost is the dash, or the caller's dash", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined, "n/a")).toBe("n/a");
  });
});
