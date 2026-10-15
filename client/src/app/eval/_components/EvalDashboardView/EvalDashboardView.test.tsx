import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboard, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../messages/en/eval.json";

const push = vi.fn();
const refetch = vi.fn();
const state: { data?: EvalDashboard; isLoading: boolean; isError: boolean } = { isLoading: false, isError: false };

vi.mock("@/lib/hooks/evals", () => ({
  useEvalDashboard: () => ({ data: state.data, isLoading: state.isLoading, isError: state.isError, refetch }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { EvalDashboardView } from "./EvalDashboardView";

afterEach(cleanup);
beforeEach(() => {
  push.mockReset();
  refetch.mockReset();
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
});

const run = (id: string, extra: Partial<EvalRunRecord> = {}): EvalRunRecord => ({
  id,
  agent_id: "a1",
  agent_name: "Sec",
  agent_version: 3,
  provider: "openai",
  model: "gpt-4.1",
  skills: [],
  status: "completed",
  has_errors: false,
  error: null,
  started_at: "2026-05-01T10:00:00.000Z",
  finished_at: "2026-05-01T10:01:00.000Z",
  recall: 0.75,
  precision: 0.5,
  citation_accuracy: 1,
  passed: 6,
  total: 8,
  cost_usd: 0.25,
  ...extra,
});

const DATA = (): EvalDashboard => ({
  agents: [
    { agent_id: "a1", name: "Sec", enabled: true, cases_total: 8, latest: run("r1") },
    { agent_id: "a2", name: "Perf-off", enabled: false, cases_total: 2, latest: null },
  ],
  recent_runs: [
    run("r2", { agent_name: "Recent-agent", started_at: "2026-05-03T10:00:00.000Z" }),
    run("r1", { agent_name: "Older-agent", started_at: "2026-05-01T10:00:00.000Z" }),
  ],
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

describe("EvalDashboardView", () => {
  it("lists a disabled agent's row", () => {
    state.data = DATA();
    renderView();
    expect(screen.getByText("Perf-off")).toBeInTheDocument();
    expect(screen.getByText(evalMessages.dashboard.disabled)).toBeInTheDocument();
  });

  it("shows never run for an agent without a completed run, and the latest metrics otherwise", () => {
    state.data = DATA();
    renderView();
    const agents = screen.getByRole("region", { name: evalMessages.dashboard.agentsTitle });
    const rows = within(agents).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Sec");
    expect(rows[0]).toHaveTextContent("v3");
    expect(rows[0]).toHaveTextContent("75%");
    expect(rows[0]).toHaveTextContent("6/8");
    expect(rows[1]).toHaveTextContent(evalMessages.evalsTab.neverRun);
    expect(rows[1]).toHaveTextContent("2");
  });

  it("clicking an agent row opens its Evals tab", () => {
    state.data = DATA();
    renderView();
    fireEvent.click(screen.getByText("Sec"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/agents/a1?tab=evals");
  });

  it("shows recent runs with the agent name, in the given order", () => {
    state.data = DATA();
    renderView();
    const recent = screen.getByRole("region", { name: evalMessages.dashboard.recentRuns });
    const rows = within(recent).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Recent-agent");
    expect(rows[1]).toHaveTextContent("Older-agent");
    expect(rows[0]).toHaveTextContent("Completed");
    expect(rows[0]).toHaveTextContent("v3");
    expect(rows[0]).toHaveTextContent("75%");
    expect(rows[0]).toHaveTextContent("6/8");
    expect(rows[0]).toHaveTextContent("$0.25");
    expect(within(recent).getByRole("columnheader", { name: evalMessages.dashboard.table.agent })).toBeInTheDocument();
  });

  it("renders only the dashboard payload", () => {
    state.data = { agents: [], recent_runs: [run("r9", { agent_name: "Only-this" })] };
    renderView();
    expect(screen.getByText("Only-this")).toBeInTheDocument();
    expect(screen.queryByText("Sec")).not.toBeInTheDocument();
  });

  it("shows the empty state when no agent has an eval set", () => {
    state.data = { agents: [], recent_runs: [] };
    renderView();
    expect(screen.getByText(evalMessages.dashboard.empty)).toBeInTheDocument();
  });

  it("shows loading", () => {
    state.isLoading = true;
    renderView();
    expect(screen.getByText(evalMessages.dashboard.loading)).toBeInTheDocument();
  });

  it("shows an error with a retry that refetches", () => {
    state.isError = true;
    renderView();
    expect(screen.getByText(evalMessages.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
