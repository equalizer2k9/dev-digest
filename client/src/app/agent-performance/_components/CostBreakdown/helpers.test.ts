import { describe, it, expect } from "vitest";
import type { PerfCostBreakdown } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";
import { donutSegments, legendLines } from "./helpers";

const t = (key: string, v?: Record<string, string | number>) => {
  const path = key.split(".");
  let node: unknown = messages;
  for (const p of path) node = (node as Record<string, unknown>)[p];
  return Object.entries(v ?? {}).reduce((s, [k, x]) => s.replace(`{${k}}`, String(x)), node as string);
};

const COLORS = ["var(--accent)", "var(--ok)"];
const B: PerfCostBreakdown = {
  lines: [
    { key: "a", label: "gpt-4.1", runs: 2, cost_usd: 1 },
    { key: "b", label: "claude", runs: 1, cost_usd: 1 },
    { key: null, label: null, runs: 1, cost_usd: 1 },
  ],
  unpriced_runs: 2,
};

describe("CostBreakdown helpers", () => {
  it("the unpriced line is not a donut segment", () => {
    const segs = donutSegments(B, COLORS, "Unknown model");
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.label)).toEqual(["gpt-4.1", "claude", "Unknown model"]);
    expect(segs.some((s) => s.label.includes("unpriced"))).toBe(false);
  });

  it("priced shares add up to 100", () => {
    const lines = legendLines(B, 3, t, "breakdown.unknownModel").filter((l) => l.share !== null);
    expect(lines.reduce((a, l) => a + l.share!, 0)).toBe(100);
  });

  it("the unpriced legend line carries the run count and no amount", () => {
    const last = legendLines(B, 3, t, "breakdown.unknownModel").at(-1)!;
    expect(last).toMatchObject({ label: "unpriced · 2 runs", amount: null, share: null });
  });

  it("all runs unpriced: no segments and only the unpriced line", () => {
    const all: PerfCostBreakdown = { lines: [], unpriced_runs: 3 };
    expect(donutSegments(all, COLORS, "x")).toEqual([]);
    const lines = legendLines(all, null, t, "breakdown.unknownModel");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount).toBeNull();
  });

  it("uses the Deleted agent label for a null agent key", () => {
    const lines = legendLines(B, 3, t, "table.deletedAgent");
    expect(lines[2]!.label).toBe("Deleted agent");
  });
});
