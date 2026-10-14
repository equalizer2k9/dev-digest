import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { partitionFindings, worstSeverity } from "./comments";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "T",
    file: "a.ts",
    start_line: 3,
    end_line: 5,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("partitionFindings", () => {
  it("anchors a finding whose start line is rendered under RIGHT:<n>", () => {
    const f = finding();
    const { matched, outside } = partitionFindings([f], new Set(["RIGHT:3", "LEFT:3"]));
    expect(matched.get("RIGHT:3")).toEqual([f]);
    expect(outside).toEqual([]);
  });

  it("does not move end_line into the anchor", () => {
    const f = finding({ start_line: 3, end_line: 5 });
    const { matched, outside } = partitionFindings([f], new Set(["RIGHT:5"]));
    expect(matched.size).toBe(0);
    expect(outside).toEqual([f]);
  });

  it("puts a finding whose line is not in the patch into outside", () => {
    const f = finding({ start_line: 99 });
    const { matched, outside } = partitionFindings([f], new Set(["RIGHT:3"]));
    expect(matched.size).toBe(0);
    expect(outside).toEqual([f]);
  });

  it("sends everything to outside when nothing is rendered", () => {
    const fs = [finding({ id: "a" }), finding({ id: "b", start_line: 7 })];
    const { matched, outside } = partitionFindings(fs, new Set());
    expect(matched.size).toBe(0);
    expect(outside).toEqual(fs);
  });

  it("groups several findings on one line", () => {
    const fs = [finding({ id: "a" }), finding({ id: "b" })];
    expect(partitionFindings(fs, new Set(["RIGHT:3"])).matched.get("RIGHT:3")).toEqual(fs);
  });
});

describe("worstSeverity", () => {
  it("is null for no findings", () => {
    expect(worstSeverity([])).toBeNull();
  });

  it("ranks CRITICAL above WARNING above SUGGESTION", () => {
    const s = (severity: FindingRecord["severity"]) => finding({ severity });
    expect(worstSeverity([s("SUGGESTION"), s("WARNING")])).toBe("WARNING");
    expect(worstSeverity([s("SUGGESTION"), s("CRITICAL"), s("WARNING")])).toBe("CRITICAL");
    expect(worstSeverity([s("SUGGESTION")])).toBe("SUGGESTION");
  });
});
