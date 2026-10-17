import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgentPerformance, AgentPerformanceRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";

const refetch = vi.fn();
const state: { real: boolean; data?: AgentPerformance; isLoading: boolean; isError: boolean } = {
  real: false,
  isLoading: false,
  isError: false,
};
const { get, post, put, del } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() }));

vi.mock("@/lib/api", () => ({ API_BASE: "http://api.test", api: { get, post, put, del } }));
vi.mock("@/lib/hooks/agent-performance", async (orig) => {
  const actual = await orig<typeof import("@/lib/hooks/agent-performance")>();
  return {
    ...actual,
    useAgentPerformance: (p: Parameters<typeof actual.useAgentPerformance>[0]) =>
      state.real
        ? actual.useAgentPerformance(p)
        : { data: state.data, isLoading: state.isLoading, isError: state.isError, refetch },
  };
});
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { AgentPerformanceView } from "./AgentPerformanceView";

afterEach(cleanup);
beforeEach(() => {
  refetch.mockReset();
  for (const f of [get, post, put, del]) f.mockReset();
  state.real = false;
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
});

const row = (id: string | null, name: string | null, over: Partial<AgentPerformanceRow> = {}): AgentPerformanceRow => ({
  agent_id: id,
  agent_name: name,
  runs: 2,
  priced_runs: 2,
  unpriced_runs: 0,
  findings_total: 0,
  accepted: 3,
  dismissed: 1,
  pending: 0,
  decided: 4,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  low_sample: true,
  avg_findings_per_run: null,
  total_cost_usd: 0.2,
  avg_cost_usd: 0.1,
  avg_latency_ms: 5_000,
  last_run_at: "2026-10-16T10:00:00.000Z",
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  trend: [],
  by_model: { lines: [{ key: "gpt-4.1", label: "gpt-4.1", runs: 2, cost_usd: 0.2 }], unpriced_runs: 0 },
  ...over,
});

const DATA = (): AgentPerformance => ({
  period: { preset: "30d", from: "2026-09-17T12:00:00.000Z", to: "2026-10-17T12:00:00.000Z" },
  totals: {
    runs: 3,
    priced_runs: 2,
    unpriced_runs: 1,
    total_cost_usd: 0.4,
    accepted: 3,
    dismissed: 1,
    decided: 4,
    accept_rate: 0.75,
  },
  most_active: { agent_id: "a1", agent_name: "Alpha", runs: 2 },
  rows: [
    row("a1", "Alpha"),
    row("a2", "Beta", { runs: 1, accept_rate: 0.5 }),
    row("a3", "Idle", {
      runs: 0,
      accept_rate: null,
      avg_cost_usd: null,
      avg_latency_ms: null,
      last_run_at: null,
      decided: 0,
      accepted: 0,
      by_model: { lines: [], unpriced_runs: 0 },
    }),
  ],
  by_agent: { lines: [{ key: "a1", label: "Alpha", runs: 2, cost_usd: 0.4 }], unpriced_runs: 1 },
  by_model: { lines: [{ key: "gpt-4.1", label: "gpt-4.1", runs: 2, cost_usd: 0.4 }], unpriced_runs: 1 },
});

const view = (period = { period: "30d" } as const) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <AgentPerformanceView period={period} onPeriod={() => {}} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

const noNumbers = () => {
  const texts = Array.from(document.body.querySelectorAll("*"))
    .filter((e) => e.children.length === 0)
    .map((e) => e.textContent ?? "");
  for (const x of texts) {
    expect(x).not.toMatch(/^(0|0%|\$0\.00)$/);
    expect(x).not.toMatch(/\$\d/);
    expect(x).not.toMatch(/\d%/);
  }
};

describe("AgentPerformanceView", () => {
  it("AC-11 loading: shows the loading copy and no numbers or data blocks", () => {
    state.isLoading = true;
    view();
    expect(screen.getByText(messages.loading)).toBeInTheDocument();
    noNumbers();
    expect(screen.queryByText(messages.kpi.totalRuns)).toBeNull();
    expect(screen.queryByText(messages.breakdown.title)).toBeNull();
  });

  it("AC-11 error: shows the load error without numbers; retry calls refetch once", () => {
    state.isError = true;
    view();
    expect(screen.getByText(messages.loadError)).toBeInTheDocument();
    noNumbers();
    expect(screen.queryByText(messages.kpi.totalRuns)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("AC-10: zero runs shows the empty state and no cards, table header or breakdown", () => {
    const d = DATA();
    d.totals.runs = 0;
    d.rows = [];
    state.data = d;
    view();
    expect(screen.getByText(messages.empty.title)).toBeInTheDocument();
    expect(screen.queryByText(messages.kpi.totalRuns)).toBeNull();
    expect(screen.queryByText(messages.table.agent)).toBeNull();
    expect(screen.queryByText(messages.breakdown.title)).toBeNull();
    expect(screen.getByRole("button", { name: messages.period.button })).toBeInTheDocument();
  });

  it("AC-9: an agent without runs shows 'No runs in period' while the KPI cards are present", () => {
    state.data = DATA();
    view();
    expect(screen.getByText(messages.table.noRuns)).toBeInTheDocument();
    expect(screen.getByText(messages.kpi.totalRuns)).toBeInTheDocument();
  });

  it("AC-7: Most active shows the agent and its runs, or a dash", () => {
    state.data = DATA();
    view();
    const card = screen.getByText(messages.kpi.mostActive).parentElement!;
    expect(within(card).getByText("Alpha")).toBeInTheDocument();
    expect(within(card).getByText("2 runs")).toBeInTheDocument();
    cleanup();
    const d = DATA();
    d.most_active = null;
    state.data = d;
    view();
    expect(within(screen.getByText(messages.kpi.mostActive).parentElement!).getByText("—")).toBeInTheDocument();
  });

  it("NFR-1/NFR-5/NFR-15: card order, priced and decided captions, badge on cost, local-only note", () => {
    state.data = DATA();
    view();
    const labels = [messages.kpi.totalRuns, messages.kpi.totalCost, messages.kpi.avgAcceptRate, messages.kpi.mostActive];
    const html = document.body.innerHTML;
    const idx = labels.map((l) => html.indexOf(l));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    const cost = screen.getByText(messages.kpi.totalCost).parentElement!;
    expect(within(cost).getByText("2 of 3 priced")).toBeInTheDocument();
    expect(within(cost).getByText(messages.costBadge)).toBeInTheDocument();
    const rate = screen.getByText(messages.kpi.avgAcceptRate).parentElement!;
    expect(within(rate).getByText("3 / 4 decided")).toBeInTheDocument();
    expect(within(rate).getByText(messages.acceptLocalOnly)).toBeInTheDocument();
    expect(screen.getAllByText("30D").length).toBeGreaterThan(0);
  });

  it("AC-12: sorting and expanding issue no request (one GET in total)", async () => {
    state.real = true;
    get.mockResolvedValue(DATA());
    view();
    await waitFor(() => expect(screen.getByText(messages.kpi.totalRuns)).toBeInTheDocument());
    const accept = screen.getByTitle(messages.acceptLocalOnly);
    fireEvent.click(accept);
    fireEvent.click(accept);
    const table = within(screen.getByRole("table"));
    fireEvent.click(table.getByText("Alpha"));
    fireEvent.click(table.getByText("Beta"));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/agent-performance?period=30d");
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });
});
