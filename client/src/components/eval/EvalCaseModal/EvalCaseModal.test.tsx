import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSingleRun } from "@devdigest/shared";
import messages from "../../../../messages/en/eval.json";
import { EvalCaseModal, type EvalCaseModalDraft, type EvalCaseModalProps } from "./EvalCaseModal";

afterEach(cleanup);

const DRAFT: EvalCaseModalDraft = {
  agent_id: "a1",
  agent_name: "Sec",
  name: "Hardcoded secret",
  expectation: { type: "must_find", file: "src/config.ts", start_line: 11, end_line: 11, title: "t" },
  input_diff: ["--- a/src/config.ts", "+++ b/src/config.ts", "@@ -9,3 +9,4 @@", " a", " b", "+secret", " c"].join("\n"),
  pr_number: 7,
  pr_title: "PR",
};

const RESULT: EvalSingleRun = {
  status: "passed",
  error: null,
  kept: 1,
  dropped: 0,
  kept_findings: [],
  cost_usd: null,
  duration_ms: 1800,
};

function setup(props: Partial<EvalCaseModalProps> = {}) {
  const fns = { onSave: vi.fn(), onRun: vi.fn(), onCancel: vi.fn(), onEdit: vi.fn() };
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
      <EvalCaseModal draft={DRAFT} {...fns} {...props} />
    </NextIntlClientProvider>,
  );
  return fns;
}

const m = messages.caseModal;
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const highlighted = () =>
  Array.from(document.querySelectorAll('[data-highlighted="true"]')).map((e) => e.textContent);

describe("EvalCaseModal", () => {
  it("prefills the name and the zone, shows the title and the read-only expectation", () => {
    setup();
    expect(screen.getByText("Eval case · Hardcoded secret")).toBeInTheDocument();
    expect(field(m.nameLabel).value).toBe("Hardcoded secret");
    expect(field(m.startLabel).value).toBe("11");
    expect(field(m.endLabel).value).toBe("11");
    expect(screen.getByText(m.typePositive)).toBeInTheDocument();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    // type and file are not inputs
    expect(screen.getAllByRole("textbox")).toHaveLength(3);
  });

  it("a dismissed finding shows the negative type", () => {
    setup({ draft: { ...DRAFT, expectation: { ...DRAFT.expectation, type: "must_not_flag" } } });
    expect(screen.getByText(m.typeNegative)).toBeInTheDocument();
  });

  it("highlights the zone in the diff fragment and redraws when it changes", () => {
    setup();
    expect(highlighted()).toEqual(["+secret"]);
    fireEvent.change(field(m.startLabel), { target: { value: "10" } });
    expect(highlighted()).toEqual([" b", "+secret"]);
    fireEvent.change(field(m.startLabel), { target: { value: "9" } });
    fireEvent.change(field(m.endLabel), { target: { value: "9" } });
    expect(highlighted()).toEqual([" a"]);
  });

  it("a zone outside every hunk says so", () => {
    setup();
    fireEvent.change(field(m.startLabel), { target: { value: "50" } });
    fireEvent.change(field(m.endLabel), { target: { value: "51" } });
    expect(screen.getByText(m.noHunk)).toBeInTheDocument();
  });

  it("an invalid edit disables Save and Run case and says why", () => {
    setup();
    fireEvent.change(field(m.nameLabel), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: m.save })).toBeDisabled();
    expect(screen.getByRole("button", { name: m.runCase })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(m.validation.nameEmpty);
    fireEvent.change(field(m.nameLabel), { target: { value: "ok" } });
    fireEvent.change(field(m.startLabel), { target: { value: "12" } });
    expect(screen.getByRole("alert")).toHaveTextContent(m.validation.startAfterEnd);
    expect(screen.getByRole("button", { name: m.save })).toBeDisabled();
    fireEvent.change(field(m.startLabel), { target: { value: "0" } });
    expect(screen.getByRole("alert")).toHaveTextContent(m.validation.startMin);
  });

  it("Save passes the trimmed name and the edited zone", () => {
    const { onSave, onRun } = setup();
    fireEvent.change(field(m.nameLabel), { target: { value: "  renamed " } });
    fireEvent.change(field(m.endLabel), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: m.save }));
    expect(onSave).toHaveBeenCalledWith({ name: "renamed", start_line: 11, end_line: 12 });
    expect(onRun).not.toHaveBeenCalled();
  });

  it("Run case passes the same edit and does not save", () => {
    const { onSave, onRun } = setup();
    fireEvent.click(screen.getByRole("button", { name: m.runCase }));
    expect(onRun).toHaveBeenCalledWith({ name: "Hardcoded secret", start_line: 11, end_line: 11 });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the run result, with a dash for an unknown cost", () => {
    setup({ result: RESULT });
    const box = screen.getByTestId("single-run-result");
    expect(box).toHaveTextContent("Passed");
    expect(box).toHaveTextContent("1 kept");
    expect(box).toHaveTextContent("—");
    expect(screen.queryByText(m.noResult)).not.toBeInTheDocument();
  });

  it("shows no result before a run", () => {
    setup();
    expect(screen.getByText(m.noResult)).toBeInTheDocument();
  });

  it("shows the server's message inline and keeps the user's edits", () => {
    setup({ error: "That zone clashes." });
    expect(screen.getByRole("alert")).toHaveTextContent("That zone clashes.");
    expect(field(m.nameLabel).value).toBe("Hardcoded secret");
  });

  it("an edit notifies the caller", () => {
    const { onEdit } = setup();
    fireEvent.change(field(m.nameLabel), { target: { value: "x" } });
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("Cancel closes without saving or running", () => {
    const { onCancel, onSave, onRun } = setup();
    fireEvent.click(screen.getByRole("button", { name: m.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(onRun).not.toHaveBeenCalled();
  });

  it("a refusal shows its reason, with Run case and Save disabled and Cancel working", () => {
    const { onCancel } = setup({ draft: null, refusal: "Accept or dismiss the finding first." });
    expect(screen.getByRole("alert")).toHaveTextContent("Accept or dismiss the finding first.");
    expect(screen.getByRole("button", { name: m.save })).toBeDisabled();
    expect(screen.getByRole("button", { name: m.runCase })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: m.cancel }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("while saving or running the buttons are disabled", () => {
    setup({ running: true });
    expect(screen.getByRole("button", { name: m.running })).toBeDisabled();
    expect(screen.getByRole("button", { name: m.save })).toBeDisabled();
  });
});
