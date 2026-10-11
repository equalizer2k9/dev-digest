import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import shellMessages from "../../../../messages/en/shell.json";
import type { DiffFindingsApi } from "../comments";
import { FileCard } from "./FileCard";

afterEach(cleanup);

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

function api(findings: FindingRecord[], show = true): DiffFindingsApi {
  return {
    findings,
    show,
    renderFinding: (f) => (
      <div data-testid="finding" data-id={f.id}>
        {f.title}
      </div>
    ),
  };
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
  it("shows no dot without findings", () => {
    renderCard({ findings: api([finding({ file: "other.ts" })]) });
    expect(dot()).toBeNull();
  });

  it("shows a dot with the worst severity, an accessible label and no number", () => {
    renderCard({
      findings: api([finding({ id: "a", severity: "SUGGESTION" }), finding({ id: "b", severity: "CRITICAL" })]),
    });
    const d = dot()!;
    expect(d).toHaveAttribute("data-severity", "CRITICAL");
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
    renderCard({ findings: api([finding({ id: "np", start_line: 1 })]) }, { ...FILE, patch: null });
    expect(screen.getByText(shellMessages.diffViewer.noDiffText)).toBeInTheDocument();
    expect(document.querySelector('[data-findings-outside] [data-id="np"]')).not.toBeNull();
    expect(dot()).not.toBeNull();
  });

  it("show=false hides finding comments and the outside block but keeps dot, stripe and label", () => {
    renderCard({
      findings: api([finding({ id: "in", start_line: 3 }), finding({ id: "out", start_line: 99 })], false),
    });
    expect(screen.queryAllByTestId("finding")).toHaveLength(0);
    expect(document.querySelector("[data-findings-outside]")).toBeNull();
    expect(dot()).not.toBeNull();
    expect(document.querySelector('[data-line-key="RIGHT:3"]')).toHaveAttribute("data-finding-severity", "WARNING");
    expect(document.querySelector("[data-finding-label]")).not.toBeNull();
  });

  it("defaultOpen={false} starts collapsed and opens on click", () => {
    renderCard({ defaultOpen: false, findings: api([finding()]) });
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
