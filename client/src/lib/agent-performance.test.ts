import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatRate,
  formatRelative,
  formatUsd,
  formatUtc,
  parsePeriodParams,
  periodCaption,
  periodSearch,
  withPeriod,
  type PeriodParams,
} from "./agent-performance";

const sp = (q: string) => new URLSearchParams(q);
const FALLBACK: PeriodParams = { period: "30d" };

describe("parsePeriodParams", () => {
  it("defaults to 30 days when nothing is set", () => {
    expect(parsePeriodParams(sp(""))).toEqual(FALLBACK);
  });

  it("accepts the presets and a valid custom range", () => {
    expect(parsePeriodParams(sp("period=1d"))).toEqual({ period: "1d" });
    expect(parsePeriodParams(sp("period=custom&from=2026-10-01&to=2026-10-01"))).toEqual({
      period: "custom",
      from: "2026-10-01",
      to: "2026-10-01",
    });
  });

  it.each([
    ["custom without to", "period=custom&from=2026-10-01"],
    ["from after to", "period=custom&from=2026-10-10&to=2026-10-01"],
    ["a non-existent date", "period=custom&from=2026-02-30&to=2026-03-01"],
    ["a wrong date format", "period=custom&from=10/01/2026&to=10/02/2026"],
    ["garbage period", "period=forever"],
    ["a preset carrying a range", "period=30d&from=2026-10-01&to=2026-10-02"],
    ["a range without period", "from=2026-10-01&to=2026-10-02"],
  ])("falls back to 30 days for %s", (_n, q) => {
    expect(parsePeriodParams(sp(q))).toEqual(FALLBACK);
  });

  it("round-trips a custom period through periodSearch", () => {
    const p: PeriodParams = { period: "custom", from: "2026-10-01", to: "2026-10-10" };
    expect(periodSearch(p)).toBe("period=custom&from=2026-10-01&to=2026-10-10");
    expect(parsePeriodParams(sp(periodSearch(p)))).toEqual(p);
    expect(periodSearch({ period: "1d" })).toBe("period=1d");
  });
});

describe("withPeriod", () => {
  it("keeps the other params such as tab=stats and replaces the old period", () => {
    const out = withPeriod(sp("tab=stats&period=1d"), { period: "custom", from: "2026-10-01", to: "2026-10-10" });
    const q = new URLSearchParams(out);
    expect(q.get("tab")).toBe("stats");
    expect(q.get("period")).toBe("custom");
    expect(q.get("from")).toBe("2026-10-01");
    const back = withPeriod(sp(out), { period: "30d" });
    expect(new URLSearchParams(back).has("from")).toBe(false);
    expect(new URLSearchParams(back).get("tab")).toBe("stats");
  });

  it("builds /agents/ag1?tab=stats&period=1d from the tab param", () => {
    expect(withPeriod(sp("tab=stats"), { period: "1d" })).toBe("tab=stats&period=1d");
  });
});

describe("periodCaption", () => {
  const t = (k: string) => (k === "period.caption1d" ? "1D" : k === "period.caption30d" ? "30D" : k);
  it("names the preset or the custom range", () => {
    expect(periodCaption({ period: "1d" }, t)).toBe("1D");
    expect(periodCaption({ period: "30d" }, t)).toBe("30D");
    expect(periodCaption({ period: "custom", from: "2026-10-01", to: "2026-10-10" }, t)).toBe("Oct 1 – Oct 10");
  });
});

describe("formatters", () => {
  it("map an absent value to a dash, never to zero", () => {
    expect(formatUsd(null)).toBe("—");
    expect(formatRate(null)).toBe("—");
    expect(formatDuration(null)).toBe("—");
    expect(formatUtc(null)).toBe("—");
    expect(formatRelative(null, new Date())).toBe("—");
  });

  it("formatUsd uses 2 decimals and 4 below one cent", () => {
    expect(formatUsd(1.5)).toBe("$1.50");
    expect(formatUsd(0.004)).toBe("$0.0040");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formatRate is a whole percentage", () => {
    expect(formatRate(0.756)).toBe("76%");
    expect(formatRate(0)).toBe("0%");
  });

  it("formatDuration is seconds, minutes above 60 s", () => {
    expect(formatDuration(12_300)).toBe("12.3 s");
    expect(formatDuration(65_000)).toBe("1.1 min");
  });

  it("formatRelative and formatUtc", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    expect(formatRelative("2026-10-17T10:00:00.000Z", now)).toBe("2 hours ago");
    expect(formatRelative("2026-10-14T12:00:00.000Z", now)).toBe("3 days ago");
    expect(formatUtc("2026-10-17T10:05:00.000Z")).toBe("2026-10-17 10:05 UTC");
  });
});
