import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";

const mutate = vi.fn();
const state: {
  smart: { data?: SmartDiff; isLoading?: boolean; isError?: boolean };
  reviews: ReviewRecord[];
  comments: PrReviewComment[];
} = { smart: {}, reviews: [], comments: [] };

vi.mock("@/lib/hooks/reviews", () => ({
  useSmartDiff: () => state.smart,
  usePrReviews: () => ({ data: state.reviews }),
  useFindingAction: () => ({ mutate, isPending: false }),
  usePrComments: () => ({ data: state.comments }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { DiffTab } from "./DiffTab";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
  state.smart = { data: SMART };
  state.reviews = [];
  state.comments = [];
});

const patch = (n: number) => `@@ -1,1 +1,2 @@\n ctx${n}\n+added${n}`;
const FILES: PrFile[] = [
  { path: "README.md", additions: 1, deletions: 0, patch: patch(1) },
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: patch(2) },
  { path: "src/config.ts", additions: 1, deletions: 0, patch: patch(3) },
  { path: "src/config.test.ts", additions: 1, deletions: 0, patch: patch(4) },
];
const sf = (path: string) => ({ path, additions: 1, deletions: 0, finding_lines: [] });
const SMART: SmartDiff = {
  groups: [
    { role: "core", files: [sf("src/config.ts")] },
    { role: "tests", files: [sf("src/config.test.ts")] },
    { role: "wiring", files: [] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
};

const ghComment = (id: number): PrReviewComment => ({
  id,
  path: "src/config.ts",
  line: 2,
  original_line: 2,
  side: "RIGHT",
  body: "gh thread body",
  user: "bob",
  created_at: "2026-10-11T09:00:00Z",
  html_url: "https://github.com/acme/app/pull/1#r7",
  in_reply_to_id: null,
  is_outdated: false,
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded secret",
  file: "src/config.ts",
  start_line: 2,
  end_line: 2,
  rationale: "A secret is committed.",
  suggestion: null,
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};
const review = (findings: FindingRecord[]): ReviewRecord =>
  ({
    id: "r1",
    run_id: "run1",
    kind: "review",
    agent_id: "a1",
    agent_name: "Agent",
    created_at: "2026-10-11T10:00:00Z",
    findings,
  }) as unknown as ReviewRecord;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages }}>
      <DiffTab
        prId="pr1"
        filesCount={FILES.length}
        files={FILES}
        canComment={false}
        repoFullName="acme/app"
        headSha="abc123"
      />
    </NextIntlClientProvider>,
  );
}

const groupHeaders = () =>
  [...document.querySelectorAll<HTMLElement>("[data-role-group]")].map((el) => el.dataset.roleGroup);
const paths = () =>
  [...document.querySelectorAll<HTMLElement>("[data-file-path]")].map((el) => el.textContent);

describe("DiffTab smart order", () => {
  it("renders five role headers in the response order", () => {
    renderTab();
    expect(groupHeaders()).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
  });

  it("starts docs and boilerplate collapsed; expanding boilerplate reveals the lock file", () => {
    renderTab();
    expect(screen.getByText("src/config.ts")).toBeInTheDocument();
    expect(screen.queryByText("pnpm-lock.yaml")).toBeNull();
    expect(screen.queryByText("README.md")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Boilerplate/ }));
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
  });

  it("switches to original order (files order, no headers) and back", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(groupHeaders()).toEqual([]);
    expect(paths()).toEqual(FILES.map((f) => f.path));
    fireEvent.click(screen.getByRole("button", { name: "Smart order" }));
    expect(groupHeaders()).toHaveLength(5);
  });

  it("falls back to original order, with no switch, when smart-diff failed", () => {
    state.smart = { isError: true };
    renderTab();
    expect(groupHeaders()).toEqual([]);
    expect(paths()).toEqual(FILES.map((f) => f.path));
    expect(screen.queryByRole("button", { name: "Smart order" })).toBeNull();
  });

  it("renders files the response does not mention after the last group", () => {
    state.smart = { data: { ...SMART, groups: SMART.groups.slice(0, 1) } };
    renderTab();
    expect(paths()).toEqual(["src/config.ts", "README.md", "pnpm-lock.yaml", "src/config.test.ts"]);
  });
});

describe("DiffTab findings", () => {
  beforeEach(() => {
    state.reviews = [review([FINDING])];
  });

  it("shows severity, title and rationale without a click, and counts files in the header", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
    const core = screen.getByRole("button", { name: /Core logic/ });
    expect(core.querySelector("[data-findings-count]")).toHaveTextContent("1");
    expect(document.querySelectorAll("[data-finding-dot]")).toHaveLength(1);
  });

  it("Accept calls mutate with findingId, action and prId", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(mutate).toHaveBeenCalledWith({ findingId: "f1", action: "accept", prId: "pr1" });
  });

  it("one button hides GitHub threads and finding comments together", () => {
    state.comments = [ghComment(7)];
    renderTab();
    const toggle = screen.getByRole("button", { name: /Hide comments \(2\)/ });
    expect(screen.getByText("gh thread body")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByText("gh thread body")).toBeNull();
    expect(screen.queryByText("Hardcoded secret")).toBeNull();
    // dot and the group counter stay
    expect(document.querySelector("[data-finding-dot]")).not.toBeNull();
    expect(document.querySelector("[data-findings-count]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show comments \(2\)/ }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("keeps findings, dots and counters in original order", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Original order" }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(document.querySelectorAll("[data-finding-dot]")).toHaveLength(1);
  });
});

describe("DiffTab without a review", () => {
  it("has no counters, no dots and no comments button", () => {
    renderTab();
    expect(document.querySelector("[data-findings-count]")).toBeNull();
    expect(document.querySelector("[data-finding-dot]")).toBeNull();
    expect(screen.queryByRole("button", { name: /comments/i })).toBeNull();
  });

  it("starts GitHub comments hidden when there are no findings", () => {
    state.comments = [ghComment(7)];
    renderTab();
    expect(screen.queryByText("gh thread body")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show comments \(1\)/ }));
    expect(screen.getByText("gh thread body")).toBeInTheDocument();
  });
});
