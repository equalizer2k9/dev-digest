import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";

const useBlastRadius = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: (...a: unknown[]) => useBlastRadius(...a) }));

const mutate = vi.fn();
const refetch = vi.fn();
const state: {
  intent: { data?: unknown; isLoading?: boolean; isError?: boolean };
  recalc: { isPending?: boolean; error?: unknown };
} = { intent: {}, recalc: {} };
const useIntent = vi.fn();
const useRecalculateIntent = vi.fn();

vi.mock("@/lib/hooks/intent", () => ({
  useIntent: (id: unknown) => {
    useIntent(id);
    return { ...state.intent, refetch };
  },
  useRecalculateIntent: (id: unknown) => {
    useRecalculateIntent(id);
    return { ...state.recalc, mutate };
  },
}));

import { OverviewTab } from "./OverviewTab";

const m = intentMessages;
afterEach(cleanup);
beforeEach(() => {
  useBlastRadius.mockReset();
  useBlastRadius.mockReturnValue({ isPending: true, isError: false, data: undefined });
  mutate.mockReset();
  refetch.mockReset();
  useIntent.mockReset();
  useRecalculateIntent.mockReset();
  state.intent = { data: { intent: null } };
  state.recalc = {};
});

const blast: BlastRadiusResponse = {
  changed_symbols: [{ name: "getItems", file: "src/items.ts", kind: "function" }],
  downstream: [
    {
      symbol: "getItems",
      callers: [{ name: "listHandler", file: "src/routes/items.ts", line: 42 }],
      endpoints_affected: [],
      crons_affected: [],
    },
  ],
  summary: "",
  degraded: false,
  reason: null,
};

function renderTab(props: { prId?: string | null; prBody?: string | null } = {}) {
  const { prId = "pr-1", prBody = "PR description text" } = props;
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ blast: messages, prReview: prReviewMessages, intent: intentMessages }}
    >
      <OverviewTab prBody={prBody} prId={prId} repoFullName="acme/shop" headSha="abc" />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab — blast radius", () => {
  it("requests the blast radius for the PR", () => {
    renderTab();
    expect(useBlastRadius).toHaveBeenCalledWith("pr-1");
  });

  it("loading: skeleton in place of the block, description still shown", () => {
    renderTab();
    expect(screen.getByText(prReviewMessages.overview.description)).toBeInTheDocument();
    expect(screen.getByText("PR description text")).toBeInTheDocument();
    expect(screen.getByTestId("blast-loading")).toBeInTheDocument();
    expect(screen.queryByText(messages.title)).toBeNull();
  });

  it("error: error text, description still shown", () => {
    useBlastRadius.mockReturnValue({ isPending: false, isError: true, data: undefined });
    renderTab();
    expect(screen.getByText("PR description text")).toBeInTheDocument();
    expect(screen.getByText(messages.error)).toBeInTheDocument();
  });

  it("success: block rendered, description still shown", () => {
    useBlastRadius.mockReturnValue({ isPending: false, isError: false, data: blast });
    renderTab();
    expect(screen.getByText("PR description text")).toBeInTheDocument();
    expect(screen.getByText(messages.title)).toBeInTheDocument();
    expect(screen.getByText("src/routes/items.ts:42")).toBeInTheDocument();
  });
});

describe("OverviewTab — intent", () => {
  it("AC-1: renders the IntentCard above the Description when prId is resolved", () => {
    renderTab({ prId: "pr1", prBody: "Body text of the PR" });
    const card = screen.getByText(m.empty.title);
    const body = screen.getByText("Body text of the PR");
    expect(card.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-1: renders the IntentCard even when the PR has no description", () => {
    renderTab({ prId: "pr1", prBody: null });
    expect(screen.getByText(m.empty.title)).toBeInTheDocument();
  });

  it("AC-1: no IntentCard without a prId", () => {
    renderTab({ prId: null, prBody: "Body" });
    expect(screen.queryByText(m.empty.title)).toBeNull();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("AC-3/7: mounting only reads; Generate triggers the recalculate mutation", () => {
    renderTab({ prId: "pr1", prBody: null });
    expect(useIntent).toHaveBeenCalledWith("pr1");
    expect(useRecalculateIntent).toHaveBeenCalledWith("pr1");
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(m.actions.generate) }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("AC-5: a load error retries via the query refetch", () => {
    state.intent = { isError: true };
    renderTab({ prId: "pr1", prBody: null });
    expect(screen.getByText(m.error.load)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("AC-4: a pending mutation disables the button", () => {
    state.recalc = { isPending: true };
    renderTab({ prId: "pr1", prBody: null });
    expect(screen.getByRole("button", { name: new RegExp(m.actions.generate) })).toBeDisabled();
    expect(screen.getByText(m.generating)).toBeInTheDocument();
  });

  it("the IntentCard sits before the blast radius block (left column, then right)", () => {
    useBlastRadius.mockReturnValue({ isPending: false, isError: false, data: blast });
    renderTab();
    const card = screen.getByText(m.empty.title);
    const block = screen.getByText(messages.title);
    expect(card.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
