import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse, PrBrief, PrFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import messages from "../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import intentMessages from "../../../../../../../../messages/en/intent.json";

const useBlastRadius = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: (...a: unknown[]) => useBlastRadius(...a) }));

const usePrBrief = vi.fn();
const useGenerateBrief = vi.fn();
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: (...a: unknown[]) => usePrBrief(...a),
  useGenerateBrief: (...a: unknown[]) => useGenerateBrief(...a),
}));

const intentMutate = vi.fn();
const intentRefetch = vi.fn();
const state: {
  intent: { data?: unknown; isLoading?: boolean; isError?: boolean };
  recalc: { isPending?: boolean; error?: unknown };
} = { intent: {}, recalc: {} };
const useIntent = vi.fn();
const useRecalculateIntent = vi.fn();
vi.mock("@/lib/hooks/intent", () => ({
  useIntent: (id: unknown) => {
    useIntent(id);
    return { ...state.intent, refetch: intentRefetch };
  },
  useRecalculateIntent: (id: unknown) => {
    useRecalculateIntent(id);
    return { ...state.recalc, mutate: intentMutate };
  },
}));

import { OverviewTab } from "./OverviewTab";

const m = intentMessages;

afterEach(cleanup);
const mutate = vi.fn();
const onOpenFile = vi.fn();
const BRIEF: PrBrief = {
  summary: "Brief summary text",
  risks: [],
  review_focus: [{ file: "src/a.ts", line: 4, reason: "start here" }],
  head_sha: "abc",
  intent: null,
  history: null,
};
const FILES: PrFile[] = [{ path: "src/a.ts", additions: 1, deletions: 0, patch: null }];
const idleMutation = { mutate, isPending: false, isError: false, error: null };
beforeEach(() => {
  useBlastRadius.mockReset();
  useBlastRadius.mockReturnValue({ isPending: true, isError: false, data: undefined });
  intentMutate.mockReset();
  intentRefetch.mockReset();
  useIntent.mockReset();
  useRecalculateIntent.mockReset();
  state.intent = { data: { intent: null } };
  state.recalc = {};
  usePrBrief.mockReset();
  useGenerateBrief.mockReset();
  mutate.mockReset();
  onOpenFile.mockReset();
  usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: null }, refetch: vi.fn() });
  useGenerateBrief.mockReturnValue(idleMutation);
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
      messages={{ blast: messages, prReview: prReviewMessages, brief: briefMessages, intent: intentMessages }}
    >
      <OverviewTab prBody={prBody} prId={prId} repoFullName="acme/shop" headSha="abc" files={FILES} onOpenFile={onOpenFile} />
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("requests the blast radius for the PR", () => {
    useBlastRadius.mockReturnValue({ isPending: true, isError: false, data: undefined });
    renderTab();
    expect(useBlastRadius).toHaveBeenCalledWith("pr-1");
  });

  it("loading: skeleton in place of the block, description still shown", () => {
    useBlastRadius.mockReturnValue({ isPending: true, isError: false, data: undefined });
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

  describe("brief", () => {
    beforeEach(() => useBlastRadius.mockReturnValue({ isPending: false, isError: false, data: blast }));

    it("renders the brief block together with the blast block (AC-4)", () => {
      renderTab();
      expect(screen.getByText(briefMessages.title)).toBeInTheDocument();
      expect(screen.getByText(messages.title)).toBeInTheDocument();
    });

    it("loads the brief for the PR and does not generate on mount (AC-18)", () => {
      renderTab();
      expect(usePrBrief).toHaveBeenCalledWith("pr-1");
      expect(mutate).not.toHaveBeenCalled();
    });

    it("Generate calls mutate with the headSha prop; a returned brief is shown (AC-2)", () => {
      const { unmount } = renderTab();
      fireEvent.click(screen.getByRole("button", { name: briefMessages.generate }));
      expect(mutate).toHaveBeenCalledWith("abc");
      unmount();
      usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() });
      renderTab();
      expect(screen.getByText("Brief summary text")).toBeInTheDocument();
    });

    it("a pending mutation shows the skeleton and disables the control (AC-26)", () => {
      useGenerateBrief.mockReturnValue({ ...idleMutation, isPending: true });
      renderTab();
      expect(screen.getByTestId("brief-skeleton")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: briefMessages.generate })).toBeDisabled();
    });

    it("a pending query shows the placeholder (AC-27)", () => {
      usePrBrief.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: vi.fn() });
      renderTab();
      expect(screen.getByTestId("brief-loading")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: briefMessages.generate })).toBeNull();
    });

    it("maps mutation errors: brief_no_files -> noFiles copy, other -> generate copy, brief kept (AC-28)", () => {
      useGenerateBrief.mockReturnValue({
        ...idleMutation,
        isError: true,
        error: new ApiError("raw server text", 409, "brief_no_files"),
      });
      const { unmount } = renderTab();
      expect(screen.getByText(briefMessages.error.noFiles)).toBeInTheDocument();
      expect(screen.queryByText("raw server text")).toBeNull();
      unmount();
      usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() });
      useGenerateBrief.mockReturnValue({ ...idleMutation, isError: true, error: new Error("boom") });
      renderTab();
      expect(screen.getByText(briefMessages.error.generate)).toBeInTheDocument();
      expect(screen.getByText("Brief summary text")).toBeInTheDocument();
    });

    it("clicking a focus item calls onOpenFile(path, line)", () => {
      usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() });
      renderTab();
      fireEvent.click(screen.getByText("src/a.ts:4"));
      expect(onOpenFile).toHaveBeenCalledWith("src/a.ts", 4);
    });
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
    expect(intentMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: m.actions.generate }));
    expect(intentMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-5: a load error retries via the query refetch", () => {
    state.intent = { isError: true };
    renderTab({ prId: "pr1", prBody: null });
    expect(screen.getByText(m.error.load)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry|try again/i }));
    expect(intentRefetch).toHaveBeenCalledTimes(1);
  });

  it("AC-4: a pending mutation disables the button", () => {
    state.recalc = { isPending: true };
    renderTab({ prId: "pr1", prBody: null });
    expect(screen.getByRole("button", { name: m.actions.generate })).toBeDisabled();
    expect(screen.getByText(m.generating)).toBeInTheDocument();
  });
});

describe("OverviewTab — stored intent in the brief (AC-5, AC-31, AC-33)", () => {
  const STORED = {
    intent: "Adds rate limiting to the login route.",
    in_scope: ["Login throttling"],
    out_of_scope: ["Password policy"],
    pr_id: "11111111-1111-4111-8111-111111111111",
    confidence: "high",
    sources: [],
    provider: "openrouter",
    model: "m",
    head_sha: "abc",
    generated_at: "2026-10-12T10:00:00Z",
    stale: false,
  };
  const loaded = (intent: unknown) => ({ data: { intent }, isLoading: false, isError: false, isSuccess: true });
  const withBrief = () =>
    usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() });
  const cardControls = () =>
    [m.actions.generate, m.actions.recalculate].flatMap((name) => screen.queryAllByRole("button", { name }));

  beforeEach(() => useBlastRadius.mockReturnValue({ isPending: false, isError: false, data: blast }));

  it("AC-31: stored intent is displayed, no 'No intent available', before a brief and with one", () => {
    state.intent = loaded(STORED);
    const { unmount } = renderTab();
    expect(screen.getByText(STORED.intent)).toBeInTheDocument();
    expect(screen.queryByText(briefMessages.inputs.noIntent)).toBeNull();
    unmount();
    withBrief();
    renderTab();
    expect(screen.getByText(STORED.intent)).toBeInTheDocument();
    expect(screen.queryByText(briefMessages.inputs.noIntent)).toBeNull();
    expect(screen.getByText(briefMessages.inputs.noSpecs)).toBeInTheDocument();
  });

  it("AC-31/AC-5: brief shown and no intent stored: both statements shown", () => {
    state.intent = loaded(null);
    withBrief();
    renderTab();
    expect(screen.getByText(briefMessages.inputs.noIntent)).toBeInTheDocument();
    expect(screen.getByText(briefMessages.inputs.noSpecs)).toBeInTheDocument();
  });

  it("AC-5: brief shown and the intent query in error (no intent can be shown): 'No intent available' is shown", () => {
    state.intent = { data: undefined, isLoading: false, isError: true };
    withBrief();
    renderTab();
    expect(screen.getByText(briefMessages.inputs.noIntent)).toBeInTheDocument();
    expect(screen.getByText(briefMessages.inputs.noSpecs)).toBeInTheDocument();
  });

  it("AC-33: a stale stored intent is displayed marked as stale", () => {
    state.intent = loaded({ ...STORED, stale: true });
    withBrief();
    renderTab();
    expect(screen.getByText(STORED.intent)).toBeInTheDocument();
    expect(screen.getByText(m.stale)).toBeInTheDocument();
  });

  it("AC-33: a fresh stored intent is not marked stale", () => {
    state.intent = loaded(STORED);
    withBrief();
    renderTab();
    expect(screen.queryByText(m.stale)).toBeNull();
  });

  it("AC-31: exactly one intent card in every state", () => {
    const intents = [loaded(STORED), loaded(null), loaded({ ...STORED, stale: true })];
    const briefs = {
      none: () => undefined,
      shown: withBrief,
      loading: () =>
        usePrBrief.mockReturnValue({ isPending: true, isError: false, data: undefined, refetch: vi.fn() }),
      generating: () => useGenerateBrief.mockReturnValue({ ...idleMutation, isPending: true }),
      generatingWithBrief: () => {
        withBrief();
        useGenerateBrief.mockReturnValue({ ...idleMutation, isPending: true });
      },
    };
    for (const intent of intents) {
      for (const [name, arrange] of Object.entries(briefs)) {
        usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: null }, refetch: vi.fn() });
        useGenerateBrief.mockReturnValue(idleMutation);
        state.intent = intent;
        arrange();
        const { unmount } = renderTab();
        const label = `${name} / ${JSON.stringify(intent.data.intent === null)}`;
        expect(cardControls().length, label).toBe(1);
        const titles = screen.queryAllByText(m.title).length;
        expect(titles, label).toBe(1);
        unmount();
      }
    }
  });

  it("AC-31: while the intent query loads, 'No intent available' is not shown", () => {
    state.intent = { data: undefined, isLoading: true, isError: false, isSuccess: false } as typeof state.intent;
    withBrief();
    renderTab();
    expect(screen.queryByText(briefMessages.inputs.noIntent)).toBeNull();
    cleanup();
    usePrBrief.mockReturnValue({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() });
    state.intent = { data: undefined, isLoading: true } as typeof state.intent;
    renderTab();
    expect(screen.queryByText(briefMessages.inputs.noIntent)).toBeNull();
  });

  it("layout: Intent block before the PR description; blast radius still rendered", () => {
    state.intent = loaded(STORED);
    renderTab({ prBody: "Body text of the PR" });
    const card = screen.getByText(STORED.intent);
    const body = screen.getByText("Body text of the PR");
    expect(card.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText(messages.title)).toBeInTheDocument();
  });
});
