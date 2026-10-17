import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PerfCostBreakdown } from "@devdigest/shared";
import messages from "../../../../../messages/en/agentPerformance.json";
import { CostBreakdown } from "./CostBreakdown";

afterEach(cleanup);

const BY_AGENT: PerfCostBreakdown = {
  lines: [
    { key: "a1", label: "Alpha", runs: 3, cost_usd: 0.75 },
    { key: null, label: null, runs: 1, cost_usd: 0.25 },
  ],
  unpriced_runs: 1,
};
const BY_MODEL: PerfCostBreakdown = {
  lines: [
    { key: "gpt-4.1", label: "gpt-4.1", runs: 3, cost_usd: 0.8 },
    { key: null, label: null, runs: 1, cost_usd: 0.2 },
  ],
  unpriced_runs: 1,
};

describe("CostBreakdown", () => {
  it("lists every line of both legends, the unpriced line, and shows the estimate badge", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ agentPerformance: messages }}>
        <CostBreakdown byAgent={BY_AGENT} byModel={BY_MODEL} total={1} />
      </NextIntlClientProvider>,
    );
    const agent = screen.getByRole("region", { name: messages.breakdown.byAgent });
    expect(within(agent).getByText("Alpha")).toBeInTheDocument();
    expect(within(agent).getByText("Deleted agent")).toBeInTheDocument();
    expect(within(agent).getByText("$0.75")).toBeInTheDocument();
    expect(within(agent).getByText("75%")).toBeInTheDocument();
    expect(within(agent).getByText("unpriced · 1 runs")).toBeInTheDocument();

    const model = screen.getByRole("region", { name: messages.breakdown.byModel });
    expect(within(model).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(model).getByText("Unknown model")).toBeInTheDocument();
    expect(within(model).getByText("unpriced · 1 runs")).toBeInTheDocument();

    expect(screen.getByText(messages.costBadge)).toBeInTheDocument();
  });
});
