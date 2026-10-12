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

  it("AC-4: the button is in the Button `loading` state (spinner icon) while generating, not while idle", () => {
    const spinning = (b: HTMLElement) => b.querySelector("svg")?.getAttribute("style") ?? "";
    const { unmount } = renderCard({ isRecalculating: true });
    const busy = screen.getByRole("button", { name: new RegExp(m.actions.recalculate) });
    expect(busy).toBeDisabled();
    expect(spinning(busy)).toContain("ddspin");
    unmount();
    renderCard({ isRecalculating: true, intent: null });
    expect(spinning(screen.getByRole("button", { name: new RegExp(m.actions.generate) }))).toContain("ddspin");
    cleanup();
    renderCard();
    expect(spinning(screen.getByRole("button", { name: new RegExp(m.actions.recalculate) }))).not.toContain("ddspin");
  });

  it("AC-6: an unknown source reason is never rendered raw; the generic `other` text is shown", () => {
    const raw = "ECONNRESET: upstream exploded at 10.0.0.1";
    renderCard({
      intent: { ...INTENT, sources: [{ kind: "linked_issue", ref: "#7", status: "missing", reason: raw }] } as PrIntentDetail,
    });
    expect(screen.queryByText(raw)).toBeNull();
    expect(screen.queryByText(new RegExp("ECONNRESET"))).toBeNull();
    expect(screen.getByText(m.sources.reason.other)).toBeInTheDocument();
  });

  it("AC-6: an Object.prototype-like reason does not leak or crash", () => {
    renderCard({
      intent: { ...INTENT, sources: [{ kind: "linked_issue", ref: "#7", status: "missing", reason: "constructor" }] } as PrIntentDetail,
    });
    expect(screen.getByText(m.sources.reason.other)).toBeInTheDocument();
  });

  it.each([
    ["empty", m.sources.reason.empty],
    ["not_synced", m.sources.reason.notSynced],
    ["no_changes", m.sources.reason.noChanges],
    ["not_found", m.sources.reason.notFound],
    ["too_large", m.sources.reason.tooLarge],
    ["truncated", m.sources.reason.truncated],
    ["not_markdown", m.sources.reason.notMarkdown],
    ["is_pull_request", m.sources.reason.pullRequest],
    ["absolute_path", m.sources.reason.absolutePath],
    ["path_traversal", m.sources.reason.pathTraversal],
    ["invalid_path", m.sources.reason.invalidPath],
    ["fetch_failed", m.sources.reason.fetchFailed],
  ])("AC-6: server reason code %s renders its message from intent.json", (code, text) => {
    renderCard({
      intent: { ...INTENT, sources: [{ kind: "spec_file", ref: "docs/x.md", status: "skipped", reason: code }] } as PrIntentDetail,
    });
    expect(screen.getByText(text)).toBeInTheDocument();
    if (code !== text) expect(screen.queryByText(code)).toBeNull();
  });

  it("AC-6: across every state, each rendered text node is an intent.json value or prop data", () => {
    const leaves = (o: unknown): string[] =>
      typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(leaves) : [];
    const allowed = new Set<string>(leaves(intentMessages));
    const kinds = ["pr_title", "pr_description", "linked_issue", "spec_file", "changed_files"] as const;
    const statuses = ["used", "missing", "skipped"] as const;
    const codes = [
      "empty", "not_synced", "no_changes", "not_found", "too_large", "truncated", "not_markdown",
      "is_pull_request", "absolute_path", "path_traversal", "invalid_path", "fetch_failed", "RAW server sentence",
    ];
    const sources = codes.map((reason, i) => ({
      kind: kinds[i % kinds.length],
      ref: `ref-${i}`,
      status: statuses[i % statuses.length],
      reason,
    }));
    // "Retry" is the @devdigest/ui ErrorState default label (IntentCard passes no retry label).
    const propData = ["Retry", "ref-", INTENT.intent, ...INTENT.in_scope, ...INTENT.out_of_scope];
    const full = { ...INTENT, sources, stale: true } as PrIntentDetail;
    const states: Partial<React.ComponentProps<typeof IntentCard>>[] = [
      { isLoading: true },
      { intent: null },
      { intent: null, isRecalculating: true },
      { intent: full },
      { intent: { ...full, in_scope: [], out_of_scope: [] } as PrIntentDetail },
      { intent: full, isRecalculating: true },
      { intent: undefined, isError: true },
      { intent: full, recalcError: new ApiError("raw boom", 500, "llm_payment_required") },
      { intent: full, recalcError: new ApiError("raw boom", 500, "llm_model_not_found") },
      { intent: full, recalcError: new ApiError("raw boom", 500, "config_error") },
      { intent: full, recalcError: new ApiError("raw boom", 500, "whatever") },
      ...(["low", "medium", "high"] as const).map((c) => ({ intent: { ...full, confidence: c } as PrIntentDetail })),
    ];
    for (const st of states) {
      const { container, unmount } = renderCard(st);
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = walker.nextNode())) {
        const text = (n.textContent ?? "").trim();
        if (!text) continue;
        const ok = allowed.has(text) || propData.some((d) => text === d || (d === "ref-" && text.startsWith(d)));
        expect(ok, `literal text "${text}" in state ${JSON.stringify(Object.keys(st))}`).toBe(true);
      }
      unmount();
    }
  });
});
