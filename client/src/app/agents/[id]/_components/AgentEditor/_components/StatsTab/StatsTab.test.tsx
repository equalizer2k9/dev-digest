import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agentPerformance.json";
import { formatRate, formatUsd } from "@/lib/agent-performance";

const replace = vi.fn();
const refetch = vi.fn();
const useAgentStats = vi.fn();
let query = "tab=stats&period=custom&from=2026-10-01&to=2026-10-10";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("@/lib/hooks/agent-performance", () => ({
  useAgentStats: (...a: unknown[]) => useAgentStats(...a),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);
beforeEach(() => {
  replace.mockReset();
  refetch.mockReset();
  useAgentStats.mockReset();
  query = "tab=stats&period=custom&from=2026-10-01&to=2026-10-10";
});

const AGENT = { id: "ag1", name: "Security" } as Agent;

const STATS = (over: Partial<AgentStats> = {}): AgentStats => ({
  agent_id: "ag1",
  agent_name: "Security",
  period: { preset: "custom", from: "2026-10-01T00:00:00.000Z", to: "2026-10-11T00:00:00.000Z" },
  runs: 3,
  priced_runs: 2,
  unpriced_runs: 1,
  findings_total: 0,
  accepted: 3,
  dismissed: 1,
  pending: 0,
  decided: 4,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  low_sample: true,
  avg_findings_per_run: null,
  total_cost_usd: 0.3,
  avg_cost_usd: 0.15,
  avg_latency_ms: 12_300,
  last_run_at: "2026-10-09T10:00:00.000Z",
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  trend: [],
  by_model: { lines: [], unpriced_runs: 1 },
  ...over,
});

const view = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <StatsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

const hookState = (o: object) => useAgentStats.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch, ...o });

const noNumbers = () => {
  for (const e of Array.from(document.body.querySelectorAll("*")).filter((x) => x.children.length === 0)) {
    const x = e.textContent ?? "";
    expect(x).not.toMatch(/^(0|0%|\$0\.00)$/);
    expect(x).not.toMatch(/\$\d/);
    expect(x).not.toMatch(/\d%/);
  }
};

describe("StatsTab", () => {
  it("AC-1: queries with the URL period and shows exactly the response values", () => {
    hookState({ data: STATS() });
    view();
    expect(useAgentStats).toHaveBeenCalledWith("ag1", { period: "custom", from: "2026-10-01", to: "2026-10-10" });
    const cost = screen.getByText(messages.stats.avgCost).parentElement!;
    expect(within(cost).getByText(formatUsd(0.15))).toBeInTheDocument();
    expect(within(cost).getByText("2 of 3 priced")).toBeInTheDocument();
    expect(within(cost).getByText(messages.costBadge)).toBeInTheDocument();
    const rate = screen.getByText(messages.stats.acceptRate).parentElement!;
    expect(within(rate).getByText(formatRate(0.75))).toBeInTheDocument();
    expect(within(rate).getByText("3 / 4 decided")).toBeInTheDocument();
    expect(within(rate).getByText(messages.acceptLocalOnly)).toBeInTheDocument();
    expect(within(rate).getByText(messages.table.lowSample)).toBeInTheDocument();
    expect(within(screen.getByText(messages.stats.avgDuration).parentElement!).getByText("12.3 s")).toBeInTheDocument();
  });

  it("hides the low-sample chip when the sample is large", () => {
    hookState({ data: STATS({ low_sample: false }) });
    view();
    expect(screen.queryByText(messages.table.lowSample)).toBeNull();
  });

  it("AC-11 loading: no numeric value", () => {
    hookState({ isLoading: true });
    view();
    expect(screen.getByRole("status")).toHaveTextContent(messages.loading);
    noNumbers();
    expect(screen.queryByText(messages.stats.totalRuns)).toBeNull();
  });

  it("AC-11 error: no numeric value, and retry calls refetch", () => {
    hookState({ isError: true });
    view();
    expect(screen.getByText(messages.loadError)).toBeInTheDocument();
    noNumbers();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("AC-10: zero runs shows the empty state and no card label", () => {
    hookState({ data: STATS({ runs: 0 }) });
    view();
    expect(screen.getByText(messages.empty.title)).toBeInTheDocument();
    expect(screen.queryByText(messages.stats.totalRuns)).toBeNull();
    expect(screen.queryByText(messages.stats.acceptRate)).toBeNull();
  });

  it("null metrics show a dash, never zero", () => {
    hookState({ data: STATS({ accept_rate: null, avg_cost_usd: null, avg_latency_ms: null, accepted: 0, decided: 0 }) });
    view();
    expect(screen.getAllByText("—")).toHaveLength(3);
  });

  it("choosing 1 day replaces the URL and keeps tab=stats", () => {
    hookState({ data: STATS() });
    view();
    fireEvent.click(screen.getByRole("button", { name: messages.period.button }));
    fireEvent.click(screen.getByText(messages.period.oneDay));
    expect(replace).toHaveBeenCalledWith("/agents/ag1?tab=stats&period=1d");
  });
});
