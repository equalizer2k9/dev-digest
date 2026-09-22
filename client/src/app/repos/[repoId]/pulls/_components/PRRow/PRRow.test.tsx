/**
 * PRRow — the COST cell (latest priced run, em dash when unpriced) and the
 * FINDINGS cell (per-severity chips + the read-only hover preview).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@/lib/types";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

// The preview's data source. Mocked rather than wrapped in a QueryClient so a
// test can also assert the query stays disabled until the cell is hovered.
let reviewsData: ReviewRecord[] = [];
const usePrReviews = vi.fn((prId: string | null | undefined) => ({
  data: prId ? reviewsData : undefined,
}));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: (prId: string | null | undefined) => usePrReviews(prId),
}));

import { PRRow } from "./PRRow";

afterEach(() => {
  cleanup();
  push.mockClear();
  usePrReviews.mockClear();
  reviewsData = [];
});

function pr(o: Partial<PrMeta> = {}): PrMeta {
  return {
    id: "pr-1",
    number: 482,
    title: "Add rate limiting to public API endpoints",
    author: "marisa.koch",
    branch: "feat/rl",
    base: "main",
    head_sha: "a1b2c3d",
    additions: 240,
    deletions: 45,
    files_count: 7,
    status: "needs_review",
    opened_at: "2026-06-10T10:00:00.000Z",
    updated_at: "2026-06-13T18:00:00.000Z",
    score: 61,
    cost_usd: 0.014,
    findings_counts: { CRITICAL: 2, WARNING: 1, SUGGESTION: 0 },
    ...o,
  };
}

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal Stripe secret key, which lands in the git history.",
    suggestion: null,
    confidence: 0.98,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(findings: FindingRecord[]): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr-1",
    agent_id: "a1",
    run_id: null,
    kind: "review",
    verdict: "request_changes",
    summary: null,
    score: 61,
    model: null,
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    created_at: "2026-08-01T10:00:00Z",
    findings,
  };
}

function renderRow(meta: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={meta} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

/** The FINDINGS cell — the chips' common parent. */
function findingsCell() {
  return screen.getByTitle("CRITICAL").parentElement!;
}

describe("PRRow — cost cell", () => {
  it("shows the latest run's cost", () => {
    renderRow(pr());
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("shows an em dash for a PR with no priced run, never $0.00", () => {
    renderRow(pr({ cost_usd: null }));
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    // both the score ring and the cost fall back to the same dash
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("an unreviewed PR (cost absent from the payload) still renders", () => {
    const { cost_usd: _omitted, ...rest } = pr({ score: null, findings_counts: null });
    renderRow(rest as PrMeta);
    expect(screen.getByText(/Add rate limiting/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});

describe("PRRow — findings cell", () => {
  it("renders one chip per severity that has findings, hiding zero counts", () => {
    renderRow(pr());
    expect(screen.getByTitle("CRITICAL").textContent).toContain("2");
    expect(screen.getByTitle("WARNING").textContent).toContain("1");
    expect(screen.queryByTitle("SUGGESTION")).not.toBeInTheDocument();
  });

  it("shows a dash and no chips when the PR has never been reviewed", () => {
    renderRow(pr({ score: null, findings_counts: null }));
    expect(screen.queryByTitle("CRITICAL")).not.toBeInTheDocument();
    expect(screen.queryByTitle("WARNING")).not.toBeInTheDocument();
    expect(screen.queryByTitle("SUGGESTION")).not.toBeInTheDocument();
  });

  it("shows a dash for a reviewed PR with no findings at all", () => {
    renderRow(pr({ findings_counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 } }));
    expect(screen.queryByTitle("CRITICAL")).not.toBeInTheDocument();
  });

  it("a chip opens the findings tab without also firing the row click", () => {
    renderRow(pr());
    fireEvent.click(screen.getByTitle("CRITICAL"));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/repos/repo-1/pulls/482?tab=findings");
  });

  it("does not fetch the reviews until the cell is hovered", () => {
    renderRow(pr());
    expect(usePrReviews).toHaveBeenCalledWith(null);
    expect(usePrReviews).not.toHaveBeenCalledWith("pr-1");
    fireEvent.mouseEnter(findingsCell());
    expect(usePrReviews).toHaveBeenCalledWith("pr-1");
  });

  it("hovering the cell shows the preview with title, name, file:line and confidence", () => {
    reviewsData = [review([finding()])];
    renderRow(pr());
    fireEvent.mouseEnter(findingsCell());
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
  });

  it("leaving the cell hides the preview", () => {
    reviewsData = [review([finding()])];
    renderRow(pr());
    const cell = findingsCell();
    fireEvent.mouseEnter(cell);
    expect(screen.getByText("1 findings")).toBeInTheDocument();
    fireEvent.mouseLeave(cell);
    expect(screen.queryByText("1 findings")).not.toBeInTheDocument();
  });

  it("the preview is read-only — no Accept/Reject, no controls of any kind", () => {
    reviewsData = [review([finding(), finding({ id: "f2", severity: "WARNING" })])];
    renderRow(pr());
    fireEvent.mouseEnter(findingsCell());
    const previewCard = screen.getByText("2 findings").parentElement!;
    // guard: the scoped queries below are worthless if this is the wrong node
    expect(within(previewCard).getAllByText(/Hardcoded Stripe secret key/)).toHaveLength(2);
    expect(within(previewCard).queryAllByRole("button")).toHaveLength(0);
    expect(within(previewCard).queryByText(/accept/i)).not.toBeInTheDocument();
    expect(within(previewCard).queryByText(/reject|dismiss/i)).not.toBeInTheDocument();
  });
});
