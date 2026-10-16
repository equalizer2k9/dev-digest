import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { ApiError } from "../../../lib/api";

const loadMutate = vi.fn();
const createMutate = vi.fn();
const runMutate = vi.fn();
const notify = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), toast: vi.fn() }));
const pending = { create: false, run: false, load: false };

vi.mock("../../../lib/hooks/evals", () => ({
  useLoadEvalCaseDraft: () => ({ mutate: loadMutate, isPending: pending.load }),
  useCreateEvalCase: () => ({ mutate: createMutate, isPending: pending.create }),
  useRunDraftCase: () => ({ mutate: runMutate, isPending: pending.run }),
}));
vi.mock("../../../lib/toast", () => ({ notify }));

import { EvalCaseButton } from "./EvalCaseButton";

afterEach(cleanup);
beforeEach(() => {
  for (const f of [loadMutate, createMutate, runMutate, notify.success, notify.error]) f.mockReset();
  pending.create = pending.run = pending.load = false;
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

const DRAFT = {
  agent_id: "a1",
  agent_name: "Sec",
  name: "Hardcoded secret",
  expectation: { type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11, title: "t" },
  input_diff: "@@ -9,3 +9,4 @@\n a\n b\n+secret\n c",
  pr_number: 7,
  pr_title: "PR",
};
const CREATED = { agent_id: "a1", agent_name: "Sec", created: true, case: {} };
const m = messages.caseModal;

/** The draft endpoint answers with `res`; the modal is expected to open for a plain draft. */
const loads = (res: unknown) =>
  loadMutate.mockImplementation((_id, opts) => opts.onSuccess(res));
const loadFails = (err: unknown) =>
  loadMutate.mockImplementation((_id, opts) => opts.onError(err));

function renderButton(f: FindingRecord) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseButton finding={f} />
    </NextIntlClientProvider>,
  );
}

const ACCEPTED = { ...FINDING, accepted_at: "x" } as FindingRecord;
const label = messages.turnInto.label;
const openModal = () => {
  loads({ existing: null, draft: DRAFT });
  renderButton(ACCEPTED);
  fireEvent.click(screen.getByRole("button", { name: label }));
};
const renderedToast = () => {
  cleanup();
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      {notify.success.mock.calls[0]![0]}
    </NextIntlClientProvider>,
  );
};

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

  it("click loads the draft and opens the modal instead of creating a case", () => {
    openModal();
    expect(loadMutate).toHaveBeenCalledTimes(1);
    expect(loadMutate.mock.calls[0]![0]).toBe("f1");
    expect(createMutate).not.toHaveBeenCalled();
    expect(runMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText(m.nameLabel)).toHaveValue("Hardcoded secret");
  });

  it("an existing case gives the 'already exists' toast and no modal", () => {
    loads({ existing: { ...CREATED, created: true }, draft: null });
    renderButton({ ...FINDING, dismissed_at: "x" });
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(notify.success).toHaveBeenCalledTimes(1);
    renderedToast();
    expect(screen.getByText("Already in Sec's eval set")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/agents/a1?tab=evals");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("Save creates the case with the edit, closes, and toasts with a link to the Evals tab", () => {
    createMutate.mockImplementation((_v, opts) => opts.onSuccess(CREATED));
    openModal();
    fireEvent.change(screen.getByLabelText(m.nameLabel), { target: { value: "renamed" } });
    fireEvent.change(screen.getByLabelText(m.endLabel), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: m.save }));
    expect(createMutate.mock.calls[0]![0]).toEqual({
      findingId: "f1",
      edit: { name: "renamed", start_line: 11, end_line: 12 },
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    renderedToast();
    expect(screen.getByText("Added to Sec's eval set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: messages.turnInto.view })).toHaveAttribute(
      "href",
      "/agents/a1?tab=evals",
    );
  });

  it("Cancel closes the modal and stores and runs nothing", () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: m.cancel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(runMutate).not.toHaveBeenCalled();
  });

  it("a Save refusal keeps the modal open with its edits and shows the reason", () => {
    createMutate.mockImplementation((_v, opts) =>
      opts.onError(new ApiError("x", 422, "eval_case_bad_zone")),
    );
    openModal();
    fireEvent.change(screen.getByLabelText(m.nameLabel), { target: { value: "mine" } });
    fireEvent.click(screen.getByRole("button", { name: m.save }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(messages.turnInto.errors.eval_case_bad_zone);
    expect(screen.getByLabelText(m.nameLabel)).toHaveValue("mine");
    expect(notify.error).not.toHaveBeenCalled();
  });

  it("a 409 on Save names the conflicting case inline", () => {
    createMutate.mockImplementation((_v, opts) =>
      opts.onError(new ApiError("x", 409, "eval_case_conflict", { case_name: "stripe-key" })),
    );
    openModal();
    fireEvent.click(screen.getByRole("button", { name: m.save }));
    expect(screen.getByRole("alert")).toHaveTextContent("stripe-key");
  });

  it("Run case shows the result in the modal and stores nothing", () => {
    runMutate.mockImplementation((_v, opts) =>
      opts.onSuccess({ status: "passed", error: null, kept: 1, dropped: 0, kept_findings: [], cost_usd: null, duration_ms: 1800 }),
    );
    openModal();
    fireEvent.click(screen.getByRole("button", { name: m.runCase }));
    expect(runMutate.mock.calls[0]![0]).toEqual({
      findingId: "f1",
      edit: { name: "Hardcoded secret", start_line: 11, end_line: 11 },
    });
    expect(screen.getByTestId("single-run-result")).toHaveTextContent("Passed");
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("a failed Run case shows the reason inline", () => {
    runMutate.mockImplementation((_v, opts) => opts.onError(new Error("boom")));
    openModal();
    fireEvent.click(screen.getByRole("button", { name: m.runCase }));
    expect(screen.getByRole("alert")).toHaveTextContent(messages.turnInto.errors.runGeneric);
  });

  it.each(["eval_case_undecided", "eval_case_no_agent", "eval_case_no_patch"] as const)(
    "422 %s opens the modal with that reason and Run case / Save disabled",
    (code) => {
      loadFails(new ApiError("x", 422, code));
      renderButton(ACCEPTED);
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(screen.getByRole("alert")).toHaveTextContent(messages.turnInto.errors[code]);
      expect(screen.getByRole("button", { name: m.save })).toBeDisabled();
      expect(screen.getByRole("button", { name: m.runCase })).toBeDisabled();
      expect(notify.error).not.toHaveBeenCalled();
    },
  );

  it("an unknown load error is a toast with the generic text", () => {
    loadFails(new Error("boom"));
    renderButton(ACCEPTED);
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(notify.error).toHaveBeenCalledWith(messages.turnInto.errors.generic);
  });
});
