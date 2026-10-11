import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";

const useBlastRadius = vi.fn();
vi.mock("@/lib/hooks/blast", () => ({ useBlastRadius: (...a: unknown[]) => useBlastRadius(...a) }));

import { OverviewTab } from "./OverviewTab";

afterEach(cleanup);
beforeEach(() => useBlastRadius.mockReset());

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
    <NextIntlClientProvider locale="en" messages={{ blast: messages, prReview: prReviewMessages }}>
      <OverviewTab prBody="PR description text" prId="pr-1" repoFullName="acme/shop" headSha="abc" />
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
});
