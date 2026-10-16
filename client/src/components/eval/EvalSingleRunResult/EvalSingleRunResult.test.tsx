import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSingleRun } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { EvalSingleRunResult } from "./EvalSingleRunResult";

afterEach(cleanup);

const RUN: EvalSingleRun = {
  status: "passed",
  error: null,
  kept: 1,
  dropped: 2,
  kept_findings: [],
  cost_usd: 0.02,
  duration_ms: 1800,
};

function renderResult(result: EvalSingleRun) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalSingleRunResult result={result} expectationType="must_find" />
    </NextIntlClientProvider>,
  );
}

describe("EvalSingleRunResult", () => {
  it("shows status, kept/dropped, duration and cost", () => {
    renderResult(RUN);
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText(/expected a finding in the zone, got 1 kept · 2 dropped · 1\.8s/)).toBeInTheDocument();
    expect(screen.getByTestId("single-run-result")).toHaveTextContent("$0.02");
  });
  it("renders an unknown cost as a dash", () => {
    renderResult({ ...RUN, cost_usd: null });
    const box = screen.getByTestId("single-run-result");
    expect(box).toHaveTextContent("—");
    expect(box).not.toHaveTextContent("$0.00");
  });
  it("an error shows its reason", () => {
    renderResult({ ...RUN, status: "error", error: "model timed out" });
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Reason: model timed out")).toBeInTheDocument();
  });
});
