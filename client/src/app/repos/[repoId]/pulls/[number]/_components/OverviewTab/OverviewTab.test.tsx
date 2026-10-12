import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import intentMessages from "../../../../../../../../messages/en/intent.json";

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
  mutate.mockReset();
  refetch.mockReset();
  useIntent.mockReset();
  useRecalculateIntent.mockReset();
  state.intent = { data: { intent: null } };
  state.recalc = {};
});

function renderTab(props: { prId: string | null; prBody: string | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: intentMessages }}>
      <OverviewTab {...props} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
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
});
