import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { severityCounts, visibleFindings } from "./helpers";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Minimal FindingRecord factory — only the fields these helpers read matter. */
function finding(over: Partial<FindingRecord> & { id: string }): FindingRecord {
  return {
    severity: "WARNING",
    category: "bug",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  } as FindingRecord;
}

describe("severityCounts", () => {
  it("tallies findings per severity", () => {
    const counts = severityCounts([
      finding({ id: "1", severity: "CRITICAL" }),
      finding({ id: "2", severity: "CRITICAL" }),
      finding({ id: "3", severity: "WARNING" }),
    ]);
    expect(counts).toEqual([
      ["CRITICAL", 2],
      ["WARNING", 1],
    ]);
  });

  it("omits severities with no findings", () => {
    const counts = severityCounts([finding({ id: "1", severity: "SUGGESTION" })]);
    expect(counts).toEqual([["SUGGESTION", 1]]);
  });

  it("orders by SEVERITY_ORDER, not by first appearance", () => {
    const counts = severityCounts([
      finding({ id: "1", severity: "SUGGESTION" }),
      finding({ id: "2", severity: "CRITICAL" }),
      finding({ id: "3", severity: "WARNING" }),
    ]);
    expect(counts.map(([sev]) => sev)).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });

  it("returns an empty array for no findings", () => {
    expect(severityCounts([])).toEqual([]);
  });
});

describe("visibleFindings — severity filter", () => {
  const FINDINGS = [
    finding({ id: "c1", severity: "CRITICAL" }),
    finding({ id: "w1", severity: "WARNING" }),
    finding({ id: "w2", severity: "WARNING" }),
  ];

  it("keeps every severity when the filter is null", () => {
    expect(visibleFindings(FINDINGS, false, null).map((f) => f.id)).toEqual(["c1", "w1", "w2"]);
  });

  it("keeps only the filtered severity", () => {
    expect(visibleFindings(FINDINGS, false, "WARNING").map((f) => f.id)).toEqual(["w1", "w2"]);
  });

  it("applies the severity filter together with hideLow", () => {
    const mixed = [
      finding({ id: "w-high", severity: "WARNING", confidence: 0.9 }),
      finding({ id: "w-low", severity: "WARNING", confidence: LOW_CONFIDENCE_THRESHOLD - 0.1 }),
      finding({ id: "c-high", severity: "CRITICAL", confidence: 0.9 }),
    ];
    expect(visibleFindings(mixed, true, "WARNING").map((f) => f.id)).toEqual(["w-high"]);
  });

  it("returns nothing when no finding has the filtered severity", () => {
    expect(visibleFindings(FINDINGS, false, "SUGGESTION")).toEqual([]);
  });

  it("still sorts by severity when filtering is off", () => {
    const unsorted = [
      finding({ id: "s1", severity: "SUGGESTION" }),
      finding({ id: "c1", severity: "CRITICAL" }),
    ];
    expect(visibleFindings(unsorted, false, null).map((f) => f.id)).toEqual(["c1", "s1"]);
  });
});
