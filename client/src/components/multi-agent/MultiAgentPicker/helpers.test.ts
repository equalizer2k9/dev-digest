import { describe, it, expect } from "vitest";
import type { AgentEstimate } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { canLaunch, formatDuration, toggle, totalEstimate } from "./helpers";

const est = (id: string, cost: number | null, ms: number | null): AgentEstimate => ({
  agent_id: id,
  agent_name: id,
  cost_usd: cost,
  duration_ms: ms,
  runs: 1,
});

describe("totalEstimate", () => {
  it("sums cost and takes the max duration of the ticked agents (AC-6)", () => {
    const all = [est("a", 0.01, 1000), est("b", 0.02, 5000), est("c", 0.5, 90000)];
    const t = totalEstimate(all, ["a", "b"]);
    expect(t.cost_usd).toBeCloseTo(0.03);
    expect(t.duration_ms).toBe(5000);
  });

  it('skips agents with "—" and is null when none has a value (EC-15)', () => {
    const all = [est("a", null, null), est("b", 0.02, null)];
    expect(totalEstimate(all, ["a", "b"])).toEqual({ cost_usd: 0.02, duration_ms: null });
    expect(totalEstimate(all, ["a"])).toEqual({ cost_usd: null, duration_ms: null });
    expect(totalEstimate(all, [])).toEqual({ cost_usd: null, duration_ms: null });
  });
});

describe("toggle", () => {
  it("adds in tick order and removes", () => {
    expect(toggle(["a"], "b")).toEqual(["a", "b"]);
    expect(toggle(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("refuses a sixth agent and keeps order", () => {
    const five = ["a", "b", "c", "d", "e"];
    expect(toggle(five, "f")).toEqual(five);
    expect(toggle(five, "c")).toEqual(["a", "b", "d", "e"]);
  });
});

describe("canLaunch", () => {
  it("is true only for 2..5", () => {
    expect([0, 1, 2, 5, 6].map(canLaunch)).toEqual([false, false, true, true, false]);
  });
});

describe("formatters", () => {
  it('use "—" for null', () => {
    expect(formatCost(null)).toBe("—");
    expect(formatDuration(null)).toBe("—");
    expect(formatCost(0.0123)).toBe("$0.012");
    expect(formatDuration(75000)).toBe("1m 15s");
    expect(formatDuration(9000)).toBe("9s");
  });
});
