import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { ApiError } from "../../../../../../../lib/api";

const mutate = vi.fn();
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }));

vi.mock("../../../../../../../lib/hooks/evals", () => ({
  useCreateEvalCase: () => ({ mutate, isPending: false }),
}));
vi.mock("../../../../../../../lib/toast", () => ({ notify }));

import { EvalCaseButton } from "./EvalCaseButton";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
  notify.success.mockReset();
  notify.error.mockReset();
});

const FINDING = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "r",
  suggestion: null,
  confidence: 0.9,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
} as FindingRecord;

function renderButton(f: FindingRecord) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseButton finding={f} />
    </NextIntlClientProvider>,
  );
}

const label = messages.turnInto.label;

describe("EvalCaseButton", () => {
  it("is disabled with the hint while the finding is undecided", () => {
    renderButton(FINDING);
    const btn = screen.getByRole("button", { name: label });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", messages.turnInto.errors.eval_case_undecided);
    const described = document.getElementById(btn.getAttribute("aria-describedby")!);
    expect(described).toHaveTextContent(messages.turnInto.errors.eval_case_undecided);
  });

  it("is enabled when accepted and when dismissed", () => {
    renderButton({ ...FINDING, accepted_at: "2026-05-01T10:00:00Z" });
    expect(screen.getByRole("button", { name: label })).toBeEnabled();
    cleanup();
    renderButton({ ...FINDING, dismissed_at: "2026-05-01T10:00:00Z" });
    expect(screen.getByRole("button", { name: label })).toBeEnabled();
  });

  it("calls mutate with the finding id once per click", () => {
    renderButton({ ...FINDING, accepted_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toBe("f1");
  });

  it("success toast links to the agent's evals tab", () => {
    mutate.mockImplementation((_id, opts) =>
      opts.onSuccess({ agent_id: "a1", agent_name: "Sec", created: true, case: {} }),
    );
    renderButton({ ...FINDING, accepted_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(notify.success).toHaveBeenCalledTimes(1);
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        {notify.success.mock.calls[0]![0]}
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Added to Sec's eval set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.turnInto.view })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals",
    );
  });

  it("created:false gives the same confirmation with the existing wording", () => {
    mutate.mockImplementation((_id, opts) =>
      opts.onSuccess({ agent_id: "a1", agent_name: "Sec", created: false, case: {} }),
    );
    renderButton({ ...FINDING, dismissed_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    cleanup();
    render(
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        {notify.success.mock.calls[0]![0]}
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Already in Sec's eval set")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/agents/a1?tab=evals");
    expect(notify.error).not.toHaveBeenCalled();
  });

  it.each([
    "eval_case_undecided",
    "eval_case_no_agent",
    "eval_case_no_patch",
    "eval_case_no_hunk",
  ] as const)("422 %s shows its reason", (code) => {
    mutate.mockImplementation((_id, opts) => opts.onError(new ApiError("x", 422, code)));
    renderButton({ ...FINDING, accepted_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(notify.error).toHaveBeenCalledWith(messages.turnInto.errors[code]);
  });

  it("409 names the conflicting case", () => {
    mutate.mockImplementation((_id, opts) =>
      opts.onError(new ApiError("x", 409, "eval_case_conflict", { case_name: "stripe-key" })),
    );
    renderButton({ ...FINDING, accepted_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(notify.error.mock.calls[0]![0]).toContain("stripe-key");
  });

  it("an unknown error falls back to the generic text", () => {
    mutate.mockImplementation((_id, opts) => opts.onError(new Error("boom")));
    renderButton({ ...FINDING, accepted_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(notify.error).toHaveBeenCalledWith(messages.turnInto.errors.generic);
  });
});
