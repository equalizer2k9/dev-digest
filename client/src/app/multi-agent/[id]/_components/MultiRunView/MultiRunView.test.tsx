import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiRunDetail } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";

const state: { data?: MultiRunDetail; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRun: () => ({ ...state, refetch: vi.fn() }),
  useMultiRunFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
  isInProgress: (s: string | null) => s == null || s === "queued" || s === "running",
}));
const nav = { search: "", replace: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/multi-agent/m1",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("@/lib/hooks/reviews", () => ({ useCancelRun: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/run-trace/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("@/components/eval/EvalCaseButton", () => ({ EvalCaseButton: () => null }));

import { MultiRunView } from "./MultiRunView";

afterEach(cleanup);
beforeEach(() => {
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
  nav.search = "";
  nav.replace.mockReset();
});

const detail = (extra: Partial<MultiRunDetail> = {}): MultiRunDetail => ({
  id: "m1",
  pr: { id: "pr1", number: 21, title: "Add retry", repo_id: "r1" },
  status: "running",
  started_at: "2026-10-16T10:00:00Z",
  wall_clock_ms: null,
  tokens_in: 300,
  tokens_out: 120,
  cost_usd: 0.05,
  agents: [
    {
      run_id: "r1",
      agent_id: "a1",
      agent_name: "Security",
      status: "done",
      error: null,
      duration_ms: 12000,
      tokens_in: 100,
      tokens_out: 40,
      cost_usd: 0.02,
      findings_count: 3,
      score: 81,
    },
    {
      run_id: "r2",
      agent_id: "a2",
      agent_name: "Performance",
      status: "running",
      error: null,
      duration_ms: null,
      tokens_in: 200,
      tokens_out: 80,
      cost_usd: 0.03,
      findings_count: null,
      score: null,
    },
  ],
  groups: [],
  ...extra,
});

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiRunView id="m1" />
    </NextIntlClientProvider>,
  );

describe("MultiRunView", () => {
  it('renders the header with PR, agents, wall-clock "—" while running, tokens, cost, status (AC-7)', () => {
    state.data = detail();
    wrap();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("#21 Add retry");
    expect(screen.getByText(`${messages.page.agents}: Security, Performance`)).toBeInTheDocument();
    expect(screen.getByText("300 / 120")).toBeInTheDocument();
    expect(screen.getByText("$0.050")).toBeInTheDocument();
    // header badge + the running agent column both read "Running"
    expect(screen.getAllByText(messages.page.status.running)).toHaveLength(2);
    const wall = screen.getByText(messages.page.wallClock);
    expect(wall.querySelector("span")).toHaveTextContent("—");
  });

  it("renders one column per agent with duration, tokens, cost, findings count, score (AC-7)", () => {
    state.data = detail();
    const { container } = wrap();
    expect(container.querySelectorAll("[data-run-id]")).toHaveLength(2);
    expect(screen.getByText("12s")).toBeInTheDocument();
    expect(screen.getByText("100 / 40")).toBeInTheDocument();
    expect(screen.getByText("$0.020")).toBeInTheDocument();
    expect(screen.getByText("81")).toBeInTheDocument();
    const findingsCell = (i: number) =>
      within(container.querySelectorAll<HTMLElement>("[data-run-id]")[i]!).getByText(messages.column.findings)
        .nextElementSibling;
    expect(findingsCell(0)).toHaveTextContent("3");
    expect(findingsCell(1)).toHaveTextContent("—");
  });

  it('titles the disagreements section "Where agents disagree", as in the spec and the design', () => {
    state.data = detail();
    wrap();
    expect(screen.getByRole("heading", { level: 2, name: "Where agents disagree" })).toBeInTheDocument();
  });

  it("keeps the last data and shows the notice when the re-request failed (EC-11)", () => {
    state.data = detail();
    state.isError = true;
    wrap();
    expect(screen.getByText(messages.page.refreshNotice)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("#21 Add retry");
  });

  it("loading placeholder before the first data", () => {
    state.isLoading = true;
    wrap();
    expect(screen.getByText(messages.page.loading)).toBeInTheDocument();
  });

  it("full error state only when there is no data", () => {
    state.isError = true;
    wrap();
    expect(screen.getByText(messages.page.loadErrorTitle)).toBeInTheDocument();
  });

  it("defaults to Columns: switch shows Columns pressed, agent columns rendered, no tabs", () => {
    state.data = detail();
    const { container } = wrap();
    expect(screen.getByRole("button", { name: messages.page.view.columns })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: messages.page.view.tabs })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelectorAll("[data-run-id]")).toHaveLength(2);
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("?view=tabs renders the Tabs view instead of the columns", () => {
    state.data = detail();
    nav.search = "view=tabs";
    const { container } = wrap();
    expect(screen.getByRole("button", { name: messages.page.view.tabs })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(container.querySelectorAll("[data-run-id]")).toHaveLength(0);
  });

  it("an unknown ?view falls back to Columns", () => {
    state.data = detail();
    nav.search = "view=grid";
    wrap();
    expect(screen.getByRole("button", { name: messages.page.view.columns })).toHaveAttribute("aria-pressed", "true");
  });

  it("the switch writes the view to the URL: Tabs → ?view=tabs, Columns → no param, other params kept", () => {
    state.data = detail();
    nav.search = "foo=1";
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.page.view.tabs }));
    expect(nav.replace).toHaveBeenLastCalledWith("/multi-agent/m1?foo=1&view=tabs", { scroll: false });
    cleanup();
    nav.search = "foo=1&view=tabs";
    wrap();
    fireEvent.click(screen.getByRole("button", { name: messages.page.view.columns }));
    expect(nav.replace).toHaveBeenLastCalledWith("/multi-agent/m1?foo=1", { scroll: false });
  });
});
