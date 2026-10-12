import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief } from "@devdigest/shared";
import briefMessages from "../../../../../../messages/en/brief.json";
import blastMessages from "../../../../../../messages/en/blast.json";
import prReviewMessages from "../../../../../../messages/en/prReview.json";
import intentMessages from "../../../../../../messages/en/intent.json";

/* Wiring only: Overview → click in the brief → Files changed gets the file and
   line. Data hooks and the heavy children are mocked; OverviewTab and
   PrBriefBlock are real, DiffTab is a probe that prints the target it got. */

let query = "";
const replace = vi.fn((url: string) => {
  query = url.split("?")[1] ?? "";
});
vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "repo-1", number: "7" }),
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ replace }),
}));

vi.mock("../../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => null }));
vi.mock("./_components/PrDetailHeader", () => ({
  PrDetailHeader: ({ onSetTab }: { onSetTab(t: string): void }) => (
    <button onClick={() => onSetTab("diff")}>open-files-tab</button>
  ),
}));
vi.mock("./_components/FindingsTab", () => ({ FindingsTab: () => null }));
vi.mock("./_components/RunTraceDrawer", () => ({ default: () => null }));
vi.mock("./_components/DiffTab", () => ({
  DiffTab: ({ target }: { target: unknown }) => <div data-testid="diff-tab">{JSON.stringify(target)}</div>,
}));

const BRIEF: PrBrief = {
  summary: "Brief summary text",
  risks: [{ kind: "logic", title: "Risky change", explanation: "why", severity: "high", file_refs: ["src/b.ts"] }],
  review_focus: [{ file: "docs/guide.md", line: 12, reason: "start here" }],
  head_sha: "abc",
  intent: null,
  history: null,
};
const PR = {
  id: "pr-1",
  number: 7,
  title: "t",
  body: "PR description",
  status: "open",
  head_sha: "abc",
  files_count: 2,
  files: [
    { path: "docs/guide.md", additions: 1, deletions: 0, patch: null },
    { path: "src/b.ts", additions: 1, deletions: 0, patch: null },
  ],
  commits: [],
};

vi.mock("../../../../../lib/hooks", () => ({
  usePulls: () => ({ data: [{ id: "pr-1", number: 7 }], isLoading: false }),
  usePullDetail: () => ({ data: PR, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock("../../../../../lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], refetch: vi.fn() }),
  useCancelRun: () => ({ mutate: vi.fn() }),
  usePrActiveRuns: () => ({ data: [] }),
  usePrRuns: () => ({ data: [] }),
  useDeleteRun: () => ({ mutate: vi.fn() }),
  useRefreshReviewsOnRunSettle: () => undefined,
}));
vi.mock("../../../../../lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { full_name: "acme/shop" } }),
  useRepoNotFound: () => false,
}));
vi.mock("@/lib/hooks/blast", () => ({
  useBlastRadius: () => ({ isPending: true, isError: false, data: undefined }),
}));
vi.mock("@/lib/hooks/intent", () => ({
  useIntent: () => ({ isLoading: false, isError: false, data: { intent: null }, refetch: vi.fn() }),
  useRecalculateIntent: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ isPending: false, isError: false, data: { brief: BRIEF }, refetch: vi.fn() }),
  useGenerateBrief: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

import PRDetailPage from "./page";

function renderPage() {
  const ui = () => (
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider
        locale="en"
        messages={{ brief: briefMessages, blast: blastMessages, prReview: prReviewMessages, intent: intentMessages }}
      >
        <PRDetailPage />
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  return render(ui());
}

beforeEach(() => {
  query = "";
  replace.mockClear();
});
afterEach(cleanup);

describe("PR page: brief → Files changed wiring", () => {
  it("a Review focus click opens Files changed with that file and line", () => {
    renderPage();
    expect(screen.queryByTestId("diff-tab")).toBeNull();

    fireEvent.click(screen.getByText("docs/guide.md:12"));

    expect(replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff");
    expect(JSON.parse(screen.getByTestId("diff-tab").textContent ?? "")).toEqual({
      path: "docs/guide.md",
      line: 12,
    });
    expect(screen.queryByText("Brief summary text")).toBeNull();
  });

  it("a risk file click opens Files changed with that file and no line", () => {
    renderPage();

    fireEvent.click(screen.getByText("src/b.ts"));

    expect(replace).toHaveBeenCalledWith("/repos/repo-1/pulls/7?tab=diff");
    expect(JSON.parse(screen.getByTestId("diff-tab").textContent ?? "")).toEqual({
      path: "src/b.ts",
      line: null,
    });
  });

  it("opening Files changed from the tab bar passes no target", () => {
    renderPage();
    fireEvent.click(screen.getByText("docs/guide.md:12"));
    fireEvent.click(screen.getByText("open-files-tab"));

    expect(screen.getByTestId("diff-tab").textContent).toBe("null");
  });
});
