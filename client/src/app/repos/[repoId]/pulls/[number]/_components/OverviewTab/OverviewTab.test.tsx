import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse, PrBrief, PrFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import messages from "../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const useBlastRadius = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: (...a: unknown[]) => useBlastRadius(...a) }));

const usePrBrief = vi.fn();
const useGenerateBrief = vi.fn();
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: (...a: unknown[]) => usePrBrief(...a),
  useGenerateBrief: (...a: unknown[]) => useGenerateBrief(...a),
}));

import { OverviewTab } from "./OverviewTab";

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

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ blast: messages, prReview: prReviewMessages, brief: briefMessages }}>
      <OverviewTab prBody="PR description text" prId="pr-1" repoFullName="acme/shop" headSha="abc" files={FILES} onOpenFile={onOpenFile} />
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
