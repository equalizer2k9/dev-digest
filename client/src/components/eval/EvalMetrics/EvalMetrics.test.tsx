import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/en/eval.json";
import { EvalMetrics } from "./EvalMetrics";

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );

describe("EvalMetrics", () => {
  it("shows the three metrics and the passed count", () => {
    wrap(<EvalMetrics run={{ recall: 0.83, precision: 0.5, citation_accuracy: 1, passed: 5, total: 8 }} />);
    expect(screen.getByText("83%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("5/8 passed")).toBeInTheDocument();
  });

  it("renders a null metric as n/a, never 0%", () => {
    wrap(<EvalMetrics run={{ recall: null, precision: 0.5, citation_accuracy: null, passed: 0, total: 0 }} />);
    expect(screen.getAllByText("n/a")).toHaveLength(2);
    expect(screen.queryByText("0%")).toBeNull();
  });
});
