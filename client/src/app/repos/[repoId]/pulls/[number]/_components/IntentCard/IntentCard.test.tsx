import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentDetail } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import intentMessages from "../../../../../../../../messages/en/intent.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

const m = intentMessages;

const INTENT: PrIntentDetail = {
  intent: "Adds rate limiting to the login route.",
  in_scope: ["Login throttling", "Config flag"],
  out_of_scope: ["Password policy"],
  pr_id: "11111111-1111-4111-8111-111111111111",
  confidence: "high",
  sources: [
    { kind: "pr_title", ref: "Add rate limit", status: "used" },
    { kind: "linked_issue", ref: "#42", status: "missing", reason: "notFound" },
    { kind: "spec_file", ref: "docs/spec.txt", status: "skipped", reason: "notMarkdown" },
  ],
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  head_sha: "abc",
  generated_at: "2026-10-12T10:00:00Z",
  stale: false,
} as PrIntentDetail;

function renderCard(props: Partial<React.ComponentProps<typeof IntentCard>> = {}) {
  const all = {
    intent: INTENT,
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    onRecalculate: vi.fn(),
    isRecalculating: false,
    recalcError: null,
    ...props,
  };
  const utils = render(
    <NextIntlClientProvider locale="en" messages={{ intent: intentMessages }}>
      <IntentCard {...all} />
    </NextIntlClientProvider>,
  );
  return { ...utils, props: all };
}

describe("IntentCard", () => {
  it("AC-2: loaded intent shows summary, scope lists, confidence, sources, Recalculate", () => {
    renderCard();
    expect(screen.getByText(m.summary)).toBeInTheDocument();
    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();
    expect(screen.getByText(m.inScope)).toBeInTheDocument();
    expect(screen.getByText(m.outOfScope)).toBeInTheDocument();
    expect(screen.getByText("Login throttling")).toBeInTheDocument();
    expect(screen.getByText("Password policy")).toBeInTheDocument();
    expect(screen.getByText(m.confidence.high)).toBeInTheDocument();
    expect(screen.getByText(m.sources.title)).toBeInTheDocument();
    expect(screen.getByText(m.sources.kind.pr_title)).toBeInTheDocument();
    expect(screen.getByText(m.sources.kind.linked_issue)).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText(m.sources.status.used)).toBeInTheDocument();
    expect(screen.getByText(m.sources.status.missing)).toBeInTheDocument();
    expect(screen.getByText(m.sources.status.skipped)).toBeInTheDocument();
    expect(screen.getByText(m.sources.reason.notFound)).toBeInTheDocument();
    expect(screen.getByText(m.sources.reason.notMarkdown)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: new RegExp(m.actions.recalculate) })).toBeInTheDocument();
  });

  it("AC-2: an empty scope list shows the emptyList text", () => {
    renderCard({ intent: { ...INTENT, out_of_scope: [] } });
    expect(screen.getAllByText(m.emptyList)).toHaveLength(1);
    renderCard({ intent: { ...INTENT, in_scope: [], out_of_scope: [] } });
    expect(screen.getAllByText(m.emptyList)).toHaveLength(3);
  });

  it("AC-2: Recalculate button calls onRecalculate", () => {
    const { props } = renderCard();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(m.actions.recalculate) }));
    expect(props.onRecalculate).toHaveBeenCalledTimes(1);
  });

  it("AC-3: null intent shows empty title, body and a Generate button", () => {
    const { props } = renderCard({ intent: null });
    expect(screen.getByText(m.empty.title)).toBeInTheDocument();
    expect(screen.getByText(m.empty.body)).toBeInTheDocument();
    expect(props.onRecalculate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(m.actions.generate) }));
    expect(props.onRecalculate).toHaveBeenCalledTimes(1);
  });

  it("AC-4: while recalculating the button is disabled, card is aria-busy, generating text shows, content stays", () => {
    const { container } = renderCard({ isRecalculating: true });
    const btn = screen.getByRole("button", { name: new RegExp(m.actions.recalculate) });
    expect(btn).toBeDisabled();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByText(m.generating)).toBeInTheDocument();
    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();
    expect(screen.getByText("Login throttling")).toBeInTheDocument();
  });

  it("AC-4: Generate button is disabled while generating from the empty state", () => {
    renderCard({ intent: null, isRecalculating: true });
    expect(screen.getByRole("button", { name: new RegExp(m.actions.generate) })).toBeDisabled();
    expect(screen.getByText(m.generating)).toBeInTheDocument();
  });

  it("AC-4: not busy when idle", () => {
    const { container } = renderCard();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it("AC-5: failed GET shows the load error with a working retry", () => {
    const { props } = renderCard({ intent: undefined, isError: true });
    expect(screen.getByText(m.error.load)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["llm_payment_required", m.error.paymentRequired],
    ["llm_model_not_found", m.error.modelNotFound],
    ["config_error", m.error.config],
    ["something_else", m.error.generic],
  ])("AC-5: recalc error %s shows specific inline text and keeps the intent", (code, text) => {
    renderCard({ recalcError: new ApiError("boom", 500, code) });
    expect(within(screen.getByRole("alert")).getByText(text)).toBeInTheDocument();
    expect(screen.getByText(INTENT.intent)).toBeInTheDocument();
  });

  it("AC-5: no inline error without recalcError", () => {
    renderCard();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("AC-6: confidence badge text comes from messages for every level", () => {
    for (const level of ["low", "medium", "high"] as const) {
      const { unmount } = renderCard({ intent: { ...INTENT, confidence: level } });
      expect(screen.getByText(m.confidence[level])).toBeInTheDocument();
      unmount();
    }
  });

  it("AC-8: stale: true shows the stale badge", () => {
    renderCard({ intent: { ...INTENT, stale: true } });
    expect(screen.getByText(m.stale)).toBeInTheDocument();
  });

  it("AC-8: stale: false hides the stale badge", () => {
    renderCard();
    expect(screen.queryByText(m.stale)).toBeNull();
  });
});
