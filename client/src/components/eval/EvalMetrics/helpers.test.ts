import { describe, it, expect } from "vitest";
import { formatCostDelta, formatDeltaPp, formatMetric, formatPassed } from "./helpers";

describe("formatMetric", () => {
  it("rounds a 0..1 ratio to a percent", () => {
    expect(formatMetric(0.83)).toBe("83%");
    expect(formatMetric(0)).toBe("0%");
    expect(formatMetric(1)).toBe("100%");
  });
  it("is null for an unknown metric", () => {
    expect(formatMetric(null)).toBeNull();
    expect(formatMetric(undefined)).toBeNull();
  });
});

describe("formatDeltaPp", () => {
  it("signs the change in percentage points", () => {
    expect(formatDeltaPp(0.12)).toBe("+12 pp");
    expect(formatDeltaPp(-0.05)).toBe("−5 pp");
    expect(formatDeltaPp(0)).toBe("0 pp");
    expect(formatDeltaPp(0.001)).toBe("0 pp");
  });
  it("is null for an unknown delta", () => {
    expect(formatDeltaPp(null)).toBeNull();
  });
});

describe("formatPassed", () => {
  it("joins passed and total", () => {
    expect(formatPassed(5, 8)).toBe("5/8");
    expect(formatPassed(0, 0)).toBe("0/0");
  });
});

describe("formatCostDelta", () => {
  it("signs a USD delta with 3 decimals", () => {
    expect(formatCostDelta(0.012)).toBe("+$0.012");
    expect(formatCostDelta(-0.004)).toBe("−$0.004");
    expect(formatCostDelta(0)).toBe("$0.000");
  });
  it("is null for an unknown delta", () => {
    expect(formatCostDelta(null)).toBeNull();
  });
});
