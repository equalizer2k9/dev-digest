import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiRunAgent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";

const cancelMutate = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({
  useCancelRun: () => ({ mutate: cancelMutate, isPending: false }),
}));
vi.mock("@/components/run-trace/RunTraceDrawer", () => ({
  default: (p: { runId: string; running?: boolean }) => (
    <div data-testid="drawer" data-run={p.runId} data-running={String(!!p.running)} />
  ),
}));

import { AgentColumns } from "./AgentColumns";

afterEach(cleanup);

const agent = (run_id: string, extra: Partial<MultiRunAgent> = {}): MultiRunAgent => ({
  run_id,
  agent_id: `ag-${run_id}`,
  agent_name: `Agent ${run_id}`,
  status: "done",
  error: null,
  duration_ms: 12000,
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.012,
  findings_count: 3,
  score: 80,
  ...extra,
});

const wrap = (agents: MultiRunAgent[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <AgentColumns agents={agents} prNumber={7} />
    </NextIntlClientProvider>,
  );

describe("AgentColumns", () => {
  it('"View trace" opens RunTraceDrawer for that run with running=true only for an in-progress run (NFR-4)', () => {
    wrap([agent("r1"), agent("r2", { status: "running" })]);
    expect(screen.queryByTestId("drawer")).not.toBeInTheDocument();
    const cols = document.querySelectorAll<HTMLElement>("[data-run-id]");
    fireEvent.click(within(cols[0]!).getByRole("button", { name: messages.column.viewTrace }));
    expect(screen.getByTestId("drawer")).toHaveAttribute("data-run", "r1");
    expect(screen.getByTestId("drawer")).toHaveAttribute("data-running", "false");
    fireEvent.click(within(cols[1]!).getByRole("button", { name: messages.column.viewTrace }));
    expect(screen.getAllByTestId("drawer")).toHaveLength(1);
    expect(screen.getByTestId("drawer")).toHaveAttribute("data-run", "r2");
    expect(screen.getByTestId("drawer")).toHaveAttribute("data-running", "true");
  });

  it("deleted agent label when agent_name is null (EC-3)", () => {
    wrap([agent("r1", { agent_name: null, agent_id: null })]);
    expect(screen.getByText(messages.column.deletedAgent)).toBeInTheDocument();
  });

  it("shows duration, tokens, cost, findings and score; cancel only while in progress", () => {
    wrap([agent("r1"), agent("r2", { status: "running", cost_usd: null, duration_ms: null, tokens_in: null, tokens_out: null })]);
    expect(screen.getByText("12s")).toBeInTheDocument();
    expect(screen.getByText("100 / 50")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: messages.column.cancel })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: messages.column.cancel }));
    expect(cancelMutate).toHaveBeenCalledWith("r2");
  });

  it("renders the run error as text", () => {
    wrap([agent("r1", { status: "failed", error: "<b>boom</b>" })]);
    expect(screen.getByText("<b>boom</b>")).toBeInTheDocument();
  });
});
