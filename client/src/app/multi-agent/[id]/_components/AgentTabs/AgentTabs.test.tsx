import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingGroup, GroupMember, MultiRunAgent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";
import prReview from "../../../../../../messages/en/prReview.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRunFindingAction: () => ({ mutate, isPending: false }),
  isInProgress: (s: string | null) => s == null || s === "queued" || s === "running",
}));
vi.mock("@/lib/hooks/reviews", () => ({ useCancelRun: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/components/run-trace/RunTraceDrawer", () => ({
  default: ({ agentName }: { agentName: string }) => <div data-testid="trace">{agentName}</div>,
}));
vi.mock("@/components/eval/EvalCaseButton", () => ({ EvalCaseButton: () => null }));

import { AgentTabs } from "./AgentTabs";

const agent = (run_id: string, agent_name: string, score: number | null): MultiRunAgent => ({
  run_id,
  agent_id: `a-${run_id}`,
  agent_name,
  status: "done",
  error: null,
  duration_ms: 12000,
  tokens_in: 100,
  tokens_out: 40,
  cost_usd: 0.02,
  findings_count: 1,
  score,
});

const member = (id: string, run_id: string, title: string): GroupMember =>
  ({
    id,
    run_id,
    title,
    severity: "WARNING",
    category: "bug",
    file: "src/a.ts",
    start_line: 3,
    end_line: 3,
    confidence: 0.8,
    rationale: "why",
    suggestion: null,
    accepted_at: null,
    dismissed_at: null,
  }) as unknown as GroupMember;

const groups: FindingGroup[] = [
  {
    id: "g1",
    representative: member("f1", "r1", "SQL injection"),
    members: [member("f1", "r1", "SQL injection"), member("f2", "r2", "Slow query")],
    conflict: true,
  } as unknown as FindingGroup,
  {
    id: "g2",
    representative: member("f3", "r1", "Missing auth"),
    members: [member("f3", "r1", "Missing auth")],
    conflict: false,
  } as unknown as FindingGroup,
];

const agents = [agent("r1", "Security", 81), agent("r2", "Performance", 64), agent("r3", "General", null)];

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages, prReview }}>
      <AgentTabs agents={agents} groups={groups} prNumber={21} multiRunId="m1" />
    </NextIntlClientProvider>,
  );

const fetchSpy = vi.fn();
beforeEach(() => {
  mutate.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("AgentTabs", () => {
  it("renders one tab per agent with its score, first selected", () => {
    wrap();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0]).toHaveTextContent("Security81");
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[2]).toHaveTextContent("General—");
  });

  it("panel shows status, duration, tokens, cost, score and only that agent's findings", () => {
    wrap();
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Security")).toBeInTheDocument();
    expect(within(panel).getByText(messages.column.status.done)).toBeInTheDocument();
    expect(within(panel).getByText("12s")).toBeInTheDocument();
    expect(within(panel).getByText("100 / 40")).toBeInTheDocument();
    expect(within(panel).getByText("$0.020")).toBeInTheDocument();
    expect(within(panel).getByText("81")).toBeInTheDocument();
    expect(within(panel).getByText("SQL injection")).toBeInTheDocument();
    expect(within(panel).getByText("Missing auth")).toBeInTheDocument();
    expect(within(panel).queryByText("Slow query")).not.toBeInTheDocument();
  });

  it("switching tabs shows the other agent's findings and makes no request", () => {
    wrap();
    fireEvent.click(screen.getByRole("tab", { name: /Performance/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Slow query")).toBeInTheDocument();
    expect(within(panel).queryByText("SQL injection")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /General/ }));
    expect(within(screen.getByRole("tabpanel")).getByText(messages.tabs.noFindings)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Security/ }));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("marks only findings from a conflict group with the conflict badge", () => {
    wrap();
    const badges = screen.getAllByText(messages.disagree.conflict);
    expect(badges).toHaveLength(1);
    expect(badges[0]!.parentElement!.nextElementSibling).toHaveTextContent("SQL injection");
  });

  it("Accept on a finding goes through the shared finding action", () => {
    wrap();
    fireEvent.click(screen.getByText("Missing auth"));
    fireEvent.click(screen.getByRole("button", { name: prReview.finding.accept }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f3", action: "accept", reply: undefined });
  });

  it("View trace opens the drawer for the selected agent", () => {
    wrap();
    fireEvent.click(screen.getByRole("tab", { name: /Performance/ }));
    fireEvent.click(screen.getByRole("button", { name: messages.column.viewTrace }));
    expect(screen.getByTestId("trace")).toHaveTextContent("Performance");
  });
});
