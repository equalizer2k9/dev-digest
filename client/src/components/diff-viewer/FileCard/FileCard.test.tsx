import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffCommentApi, DiffFindingsApi } from "../comments";
import { FileCard } from "./FileCard";
import { TARGET_HIGHLIGHT_MS } from "../constants";

const scroll = vi.fn();
beforeEach(() => {
  scroll.mockReset();
  Element.prototype.scrollIntoView = scroll;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const PATCH = "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;";

const FILE: PrFile = { path: "src/config.ts", additions: 2, deletions: 1, patch: PATCH };

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "bug",
    title: "Title",
    file: "src/config.ts",
    start_line: 3,
    end_line: 3,
    rationale: "why",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function api(findings: FindingRecord[]): DiffFindingsApi {
  return {
    findings,
    renderFinding: (f) => (
      <div data-testid="finding" data-id={f.id}>
        {f.title}
      </div>
    ),
  };
}

const outdatedComment: PrReviewComment = {
  id: 9,
  path: "src/config.ts",
  line: null,
  original_line: 12,
  side: "RIGHT",
  body: "stale thread body",
  user: "bob",
  created_at: "2026-10-11T09:00:00Z",
  html_url: "https://github.com/acme/app/pull/1#r9",
  in_reply_to_id: null,
  is_outdated: true,
};

function commentApi(showComments: boolean, comments: PrReviewComment[] = []): DiffCommentApi {
  return { comments, canComment: false, showComments, posting: false, onSubmit: vi.fn() };
}

function renderCard(props: Partial<React.ComponentProps<typeof FileCard>> = {}, file = FILE) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <FileCard file={file} {...props} />
    </NextIntlClientProvider>,
  );
}

const dot = () => document.querySelector<HTMLElement>("[data-finding-dot]");

describe("FileCard findings", () => {
  it("shows no dot unless the caller says the file has findings", () => {
    renderCard({ findings: api([finding()]) });
    expect(dot()).toBeNull();
  });

  it("shows a neutral dot with an accessible label and no number when hasFindings", () => {
    renderCard({ hasFindings: true });
    const d = dot()!;
    expect(d).not.toHaveAttribute("data-severity");
    expect(d).toHaveAttribute("aria-label", shellMessages.diffViewer.hasFindings);
    expect(d.textContent).toBe("");
  });

  it("renders the finding right after the row of its line", () => {
    renderCard({ findings: api([finding({ start_line: 3 })]) });
    const row = document.querySelector<HTMLElement>('[data-line-key="RIGHT:3"]')!;
    expect(row).toHaveTextContent("const c = 4;");
    const wrap = row.closest("[data-line-wrap]")!;
    expect(wrap.querySelector('[data-testid="finding"]')).not.toBeNull();
    expect(row.nextElementSibling).toContainElement(screen.getByTestId("finding"));
    expect(screen.getAllByTestId("finding")).toHaveLength(1);
  });

  it("marks the row with the severity stripe and label", () => {
    renderCard({
      findings: api([finding({ id: "a", severity: "WARNING" }), finding({ id: "b", severity: "CRITICAL" })]),
    });
    const row = document.querySelector<HTMLElement>('[data-line-key="RIGHT:3"]')!;
    expect(row).toHaveAttribute("data-finding-severity", "CRITICAL");
    expect(row.querySelector("[data-finding-label]")).toHaveTextContent("blocker");
  });

  it.each([
    ["WARNING", "warning"],
    ["SUGGESTION", "suggestion"],
  ] as const)("labels %s as %s", (severity, label) => {
    renderCard({ findings: api([finding({ severity })]) });
    expect(document.querySelector("[data-finding-label]")).toHaveTextContent(label);
  });

  it("shows a finding outside the patch in a separate block at the end", () => {
    renderCard({ findings: api([finding({ id: "out", start_line: 99 })]) });
    const block = document.querySelector<HTMLElement>("[data-findings-outside]")!;
    expect(block).toHaveTextContent(shellMessages.diffViewer.findingsOutsideTitle);
    expect(block.querySelector('[data-id="out"]')).not.toBeNull();
    expect(document.querySelector("[data-finding-severity]")).toBeNull();
  });

  it("shows the outside block for a file with no patch, under the no-diff note", () => {
    renderCard(
      { hasFindings: true, findings: api([finding({ id: "np", start_line: 1 })]) },
      { ...FILE, patch: null },
    );
    expect(screen.getByText(shellMessages.diffViewer.noDiffText)).toBeInTheDocument();
    expect(document.querySelector('[data-findings-outside] [data-id="np"]')).not.toBeNull();
    expect(dot()).not.toBeNull();
  });

  it("puts the outside-findings block before the outdated-comments block", () => {
    renderCard({
      findings: api([finding({ id: "out", start_line: 99 })]),
      commenting: commentApi(true, [outdatedComment]),
    });
    const outside = document.querySelector<HTMLElement>("[data-findings-outside]")!;
    const outdated = screen.getByText(/comment\(s\) on older revisions/);
    expect(outside).toBeInTheDocument();
    expect(screen.getByText("stale thread body")).toBeInTheDocument();
    expect(outside.compareDocumentPosition(outdated) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("showComments=false hides finding comments, the outside block and outdated threads but keeps dot, stripe and label", () => {
    renderCard({
      hasFindings: true,
      commenting: commentApi(false, [outdatedComment]),
      findings: api([finding({ id: "in", start_line: 3 }), finding({ id: "out", start_line: 99 })]),
    });
    expect(screen.queryAllByTestId("finding")).toHaveLength(0);
    expect(document.querySelector("[data-findings-outside]")).toBeNull();
    expect(screen.queryByText("stale thread body")).toBeNull();
    expect(dot()).not.toBeNull();
    expect(document.querySelector('[data-line-key="RIGHT:3"]')).toHaveAttribute("data-finding-severity", "WARNING");
    expect(document.querySelector("[data-finding-label]")).not.toBeNull();
  });

  it("defaultOpen={false} starts collapsed and opens on click", () => {
    renderCard({ defaultOpen: false, hasFindings: true, findings: api([finding()]) });
    expect(screen.queryByText("const c = 4;")).toBeNull();
    expect(dot()).not.toBeNull();
    fireEvent.click(screen.getByText("src/config.ts"));
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
  });

  it("without defaultOpen a small file starts open", () => {
    renderCard();
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
  });
});

describe("FileCard target", () => {
  const row = (n: number) => document.querySelector<HTMLElement>(`[data-line-key="RIGHT:${n}"]`)!;

  it("opens a collapsed card, highlights the line, scrolls to it, then clears the highlight", () => {
    vi.useFakeTimers();
    renderCard({ target: { line: 3 }, defaultOpen: false });
    expect(screen.getByText("const c = 4;")).toBeInTheDocument();
    expect(row(3)).toHaveAttribute("data-target-highlight");
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(row(3));
    act(() => {
      vi.advanceTimersByTime(TARGET_HIGHLIGHT_MS);
    });
    expect(row(3)).not.toHaveAttribute("data-target-highlight");
  });

  it("a line that is not rendered, or no line, scrolls the card top and highlights nothing", () => {
    for (const line of [999, null]) {
      scroll.mockReset();
      const { container } = renderCard({ target: { line } });
      expect(document.querySelector("[data-target-highlight]")).toBeNull();
      expect(scroll).toHaveBeenCalledTimes(1);
      expect(scroll.mock.contexts[0]).toBe(container.firstElementChild);
      cleanup();
    }
  });

  it("without a target nothing is scrolled", () => {
    renderCard();
    expect(scroll).not.toHaveBeenCalled();
  });
});
