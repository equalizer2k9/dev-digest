import { describe, it, expect } from "vitest";
import type { AgentPerformanceRow } from "@devdigest/shared";
import { sortRows } from "./helpers";

const row = (name: string | null, runs: number, rate: number | null, low = false): AgentPerformanceRow => ({
  agent_id: name,
  agent_name: name,
  runs,
  priced_runs: runs,
  unpriced_runs: 0,
  findings_total: 0,
  accepted: 0,
  dismissed: 0,
  pending: 0,
  decided: low ? 2 : 10,
  accept_rate: rate,
  dismiss_rate: null,
  low_sample: low,
  avg_findings_per_run: null,
  total_cost_usd: null,
  avg_cost_usd: null,
  avg_latency_ms: null,
  last_run_at: null,
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  trend: [],
  by_model: { lines: [], unpriced_runs: 0 },
});

const ROWS = [
  row("zero-b", 0, null, true),
  row("low-few", 2, 1, true),
  row("high", 9, 0.9),
  row("low-many", 6, 0.5, true),
  row("mid-a", 4, 0.5),
  row("mid-b", 8, 0.5),
  row("low-rate", 5, 0.1),
  row("zero-a", 0, null, true),
];
const names = (rs: AgentPerformanceRow[]) => rs.map((r) => r.agent_name);

describe("sortRows (A-6)", () => {
  it("desc: ranked by rate, ties by runs then name; then low sample by runs; then zero-run rows by name", () => {
    expect(names(sortRows(ROWS, "desc"))).toEqual([
      "high",
      "mid-b",
      "mid-a",
      "low-rate",
      "low-many",
      "low-few",
      "zero-a",
      "zero-b",
    ]);
  });

  it("asc reverses only the ranked group; low-sample and zero-run rows stay after it", () => {
    const out = names(sortRows(ROWS, "asc"));
    expect(out).toEqual(["low-rate", "mid-b", "mid-a", "high", "low-many", "low-few", "zero-a", "zero-b"]);
  });

  it("puts every low-sample row after every non-low-sample row in both directions", () => {
    for (const dir of ["desc", "asc"] as const) {
      const out = sortRows(ROWS, dir).filter((r) => r.runs > 0);
      const firstLow = out.findIndex((r) => r.low_sample);
      expect(out.slice(firstLow).every((r) => r.low_sample)).toBe(true);
    }
  });

  it("does not mutate its input", () => {
    const copy = [...ROWS];
    sortRows(ROWS, "desc");
    expect(ROWS).toEqual(copy);
  });

  it("sorts the Deleted row by the same rules (null name last on a tie)", () => {
    const out = sortRows([row(null, 5, 0.5), row("x", 5, 0.5)], "desc");
    expect(names(out)).toEqual(["x", null]);
  });
});
