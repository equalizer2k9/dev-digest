import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentPerformanceRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";
import { PerformanceTable } from "./PerformanceTable";

afterEach(cleanup);

const base = (over: Partial<AgentPerformanceRow>): AgentPerformanceRow => ({
  agent_id: "a1",
  agent_name: "Alpha",
  runs: 10,
  priced_runs: 8,
  unpriced_runs: 2,
  findings_total: 0,
  accepted: 6,
  dismissed: 2,
  pending: 0,
  decided: 8,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  low_sample: false,
  avg_findings_per_run: null,
  total_cost_usd: 0.8,
  avg_cost_usd: 0.1,
  avg_latency_ms: 12_300,
  last_run_at: "2026-10-16T10:00:00.000Z",
  findings_by_severity: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  trend: [],
  by_model: {
    lines: [
      { key: "gpt-4.1", label: "gpt-4.1", runs: 8, cost_usd: 0.8 },
      { key: null, label: null, runs: 0, cost_usd: 0 },
    ],
    unpriced_runs: 2,
  },
  ...over,
});

const ROWS: AgentPerformanceRow[] = [
  base({ agent_id: "a1", agent_name: "Alpha", accept_rate: 0.75 }),
  base({ agent_id: "a2", agent_name: "Beta", accept_rate: 0.25, accepted: 2, by_model: { lines: [{ key: "claude", label: "claude", runs: 8, cost_usd: 0.5 }], unpriced_runs: 0 } }),
  base({ agent_id: "a3", agent_name: "Gamma", runs: 3, low_sample: true, decided: 2, accept_rate: 1 }),
  base({
    agent_id: "a4",
    agent_name: "Idle",
    runs: 0,
    priced_runs: 0,
    unpriced_runs: 0,
    decided: 0,
    accepted: 0,
    accept_rate: null,
    avg_cost_usd: null,
    avg_latency_ms: null,
    last_run_at: null,
    low_sample: true,
    by_model: { lines: [], unpriced_runs: 0 },
  }),
  base({ agent_id: null, agent_name: null, runs: 4, accept_rate: 0.5 }),
];
const PERIOD = { period: "custom", from: "2026-10-01", to: "2026-10-10" } as const;

const view = (rows = ROWS) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
      <PerformanceTable rows={rows} period={PERIOD} />
    </NextIntlClientProvider>,
  );

const bodyRows = () => screen.getAllByRole("row").slice(1);
const order = () => bodyRows().map((r) => r.textContent ?? "");
const accept = () => screen.getByTitle(messages.acceptLocalOnly);

describe("PerformanceTable", () => {
  it("AC-6: clicking Accept reverses the order and keeps low-sample and zero-run rows at the end", () => {
    view();
    const first = () => order()[0]!;
    expect(first()).toContain("Alpha");
    fireEvent.click(accept());
    expect(first()).toContain("Beta");
    const last3 = order().slice(-3).join("|");
    expect(last3).toContain("Gamma");
    expect(order().at(-1)).toContain("Idle");
  });

  it("AC-9: the zero-run row says no runs in period and shows no digit", () => {
    view();
    const idle = bodyRows().find((r) => r.textContent?.includes("Idle"))!;
    expect(within(idle).getByText(messages.table.noRuns)).toBeInTheDocument();
    expect(idle.textContent).not.toMatch(/\d/);
  });

  it("NFR-3: a row click opens its model lines and unpriced line; a second row opens too; View does not toggle", () => {
    view();
    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("unpriced · 2 runs")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Beta"));
    expect(screen.getByText("claude")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();

    const alpha = bodyRows().find((r) => r.textContent?.includes("Alpha"))!;
    const link = within(alpha).getByRole("link", { name: messages.table.view });
    link.addEventListener("click", (e) => e.preventDefault());
    fireEvent.click(link);
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument(); // still open: View did not toggle

    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.queryByText("gpt-4.1")).toBeNull();
    expect(screen.getByText("claude")).toBeInTheDocument();
  });

  it("NFR-7: View links to the agent's Stats tab with the period; the Deleted row has no link", () => {
    view();
    const links = screen.getAllByRole("link", { name: messages.table.view });
    expect(links[0]).toHaveAttribute("href", "/agents/a1?tab=stats&period=custom&from=2026-10-01&to=2026-10-10");
    const deleted = bodyRows().find((r) => r.textContent?.includes("Deleted agent"))!;
    expect(within(deleted).queryByRole("link")).toBeNull();
  });

  it("renders names as text, not markup", () => {
    view([base({ agent_name: '<img src=x alt="boom">' })]);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText('<img src=x alt="boom">')).toBeInTheDocument();
  });

  it("NFR-15: the Accept header carries the local-only tooltip", () => {
    view();
    expect(accept()).toHaveAttribute("title", messages.acceptLocalOnly);
  });

  it("shows the low-sample chip, decided counts and N of M priced", () => {
    view();
    expect(screen.getAllByText(messages.table.lowSample)).toHaveLength(1);
    expect(screen.getAllByText("6 / 8 decided").length).toBeGreaterThan(0);
    expect(screen.getAllByText("8 of 10 priced").length).toBeGreaterThan(0);
  });
});
