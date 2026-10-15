import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { EvalRunTable } from "./EvalRunTable";

afterEach(cleanup);

const run = (extra: Partial<EvalRunRecord> = {}): EvalRunRecord => ({
  id: "r1",
  agent_id: "a1",
  agent_name: "Security reviewer",
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
  passed: 5,
  total: 8,
  cost_usd: 0.0123,
  ...extra,
});

const wrap = (props: React.ComponentProps<typeof EvalRunTable>) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalRunTable {...props} />
    </NextIntlClientProvider>,
  );

describe("EvalRunTable", () => {
  it("shows status, version, the three metrics, N/M and cost", () => {
    wrap({ runs: [run()] });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("5/8")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").length).toBeGreaterThanOrEqual(8);
  });

  it("marks a run that had errors", () => {
    wrap({ runs: [run({ has_errors: true })] });
    expect(screen.getByLabelText("Some cases errored")).toBeInTheDocument();
  });

  it("renders a null cost as an em dash, never $0.00", () => {
    wrap({ runs: [run({ cost_usd: null })] });
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });

  it("renders null metrics as n/a", () => {
    wrap({ runs: [run({ recall: null, precision: null, citation_accuracy: null })] });
    expect(screen.getAllByText("n/a")).toHaveLength(3);
  });

  it("shows the agent column only with showAgent", () => {
    const { unmount } = wrap({ runs: [run()] });
    expect(screen.queryByText("Security reviewer")).toBeNull();
    unmount();
    wrap({ runs: [run()], showAgent: true });
    expect(screen.getByText("Security reviewer")).toBeInTheDocument();
  });

  it("offers a checkbox only on completed rows", () => {
    const onToggle = vi.fn();
    wrap({
      runs: [run({ id: "r1" }), run({ id: "r2", status: "running" }), run({ id: "r3", status: "failed" })],
      selectable: true,
      selected: [],
      onToggle,
    });
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes).toHaveLength(1);
    fireEvent.click(boxes[0]!);
    expect(onToggle).toHaveBeenCalledWith("r1");
  });

  it("renders a hostile agent name as text, with no img element", () => {
    const { container } = wrap({
      runs: [run({ agent_name: "<img src=x onerror=alert(1)>" })],
      showAgent: true,
    });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
