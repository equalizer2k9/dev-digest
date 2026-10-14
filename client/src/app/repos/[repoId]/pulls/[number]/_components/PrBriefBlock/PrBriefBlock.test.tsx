import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/brief.json";
import { PrBriefBlock } from "./PrBriefBlock";

afterEach(cleanup);

const BRIEF: PrBrief = {
  summary: "Adds the thing.",
  risks: [
    { kind: "k", title: "Risk One", explanation: "Because one.", severity: "high", file_refs: ["src/a.ts"] },
    { kind: "k", title: "Risk Two", explanation: "Because two.", severity: "low", file_refs: ["src/gone.ts"] },
  ],
  review_focus: [
    { file: "src/a.ts", line: 12, reason: "Read this first" },
    { file: "src/other.ts", line: 3, reason: "Outside the diff" },
  ],
  head_sha: "sha1",
  intent: null,
  history: null,
};
const PATHS = new Set(["src/a.ts"]);

function setup(over: Partial<React.ComponentProps<typeof PrBriefBlock>> = {}) {
  const props = {
    status: "ready" as const,
    brief: BRIEF as PrBrief | null,
    headSha: "sha1",
    prFilePaths: PATHS,
    generating: false,
    generateError: null,
    onGenerate: vi.fn(),
    onRetryLoad: vi.fn(),
    onOpenFile: vi.fn(),
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={{ brief: messages }}>
      <PrBriefBlock {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("PrBriefBlock", () => {
  it("no brief: generate button, no lists (AC-1)", () => {
    setup({ brief: null });
    expect(screen.getByRole("button", { name: messages.generate })).toBeInTheDocument();
    expect(screen.queryByText(messages.block.riskAreas)).toBeNull();
    expect(screen.queryByText(messages.block.reviewFocus)).toBeNull();
  });

  it("brief: summary, both lists, and empty-state texts (AC-3)", () => {
    setup();
    expect(screen.getByText("Adds the thing.")).toBeInTheDocument();
    expect(screen.getByText(messages.block.riskAreas)).toBeInTheDocument();
    expect(screen.getByText(messages.block.reviewFocus)).toBeInTheDocument();
    cleanup();
    setup({ brief: { ...BRIEF, risks: [], review_focus: [] } });
    expect(screen.getByText(messages.noRisks)).toBeInTheDocument();
    expect(screen.getByText(messages.noFocus)).toBeInTheDocument();
  });

  it("shows both inputs statements with a brief, none without (AC-5)", () => {
    setup({ noIntent: true });
    expect(screen.getByText(messages.inputs.noIntent)).toBeInTheDocument();
    expect(screen.getByText(messages.inputs.noSpecs)).toBeInTheDocument();
    cleanup();
    setup({ brief: null });
    expect(screen.queryByText(messages.inputs.noIntent)).toBeNull();
    expect(screen.queryByText(messages.inputs.noSpecs)).toBeNull();
  });

  it("risks show title, severity label and path in order (AC-6)", () => {
    setup();
    const titles = screen.getAllByRole("button", { expanded: false }).map((b) => b.textContent);
    expect(titles).toEqual(["Risk One", "Risk Two"]);
    expect(screen.getByText(messages.severity.high)).toBeInTheDocument();
    expect(screen.getByText(messages.severity.low)).toBeInTheDocument();
    expect(screen.getByText("src/a.ts", { selector: "button" })).toBeInTheDocument();
  });

  it("focus items show file:line and reason in order (AC-7)", () => {
    setup();
    expect(screen.getByText("src/a.ts:12")).toBeInTheDocument();
    expect(screen.getByText("src/other.ts:3")).toBeInTheDocument();
    const reasons = screen.getAllByText(/Read this first|Outside the diff/).map((e) => e.textContent);
    expect(reasons).toEqual(["Read this first", "Outside the diff"]);
  });

  it("stale marker when SHAs differ, brief kept; none when equal (AC-20)", () => {
    setup({ headSha: "sha2" });
    expect(screen.getByText(messages.stale)).toBeInTheDocument();
    expect(screen.getByText("Adds the thing.")).toBeInTheDocument();
    cleanup();
    setup();
    expect(screen.queryByText(messages.stale)).toBeNull();
  });

  it("refresh calls onGenerate, stale or fresh (AC-21)", () => {
    for (const headSha of ["sha1", "sha2"]) {
      const p = setup({ headSha });
      fireEvent.click(screen.getByRole("button", { name: messages.refresh }));
      expect(p.onGenerate).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("not-in-diff entries show the note and do not navigate; in-diff ones do (AC-24)", () => {
    const p = setup();
    expect(screen.getAllByText(messages.notInDiff)).toHaveLength(2);
    fireEvent.click(screen.getByText("src/other.ts:3"));
    fireEvent.click(screen.getByText("src/gone.ts"));
    expect(p.onOpenFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("src/a.ts:12"));
    expect(p.onOpenFile).toHaveBeenCalledWith("src/a.ts", 12);
    fireEvent.click(screen.getByText("src/a.ts", { selector: "button" }));
    expect(p.onOpenFile).toHaveBeenLastCalledWith("src/a.ts", null);
  });

  it("risk row toggles the explanation; file ref click does not (AC-25)", () => {
    setup();
    expect(screen.queryByText("Because one.")).toBeNull();
    fireEvent.click(screen.getByText("Risk One"));
    expect(screen.getByText("Because one.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Risk One"));
    expect(screen.queryByText("Because one.")).toBeNull();
    fireEvent.click(screen.getByText("src/a.ts", { selector: "button" }));
    expect(screen.queryByText("Because one.")).toBeNull();
  });

  it("generating: skeleton and disabled control (AC-26)", () => {
    setup({ generating: true });
    expect(screen.getByTestId("brief-skeleton")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.refresh })).toBeDisabled();
  });

  it("generating with a failed error: Try again is disabled too (AC-26)", () => {
    setup({ generating: true, generateError: "failed" });
    expect(screen.getByRole("button", { name: messages.error.retry })).toBeDisabled();
  });

  it("loading: placeholder, no generate; loadError: copy, no generate (AC-27)", () => {
    setup({ status: "loading", brief: null });
    expect(screen.getByTestId("brief-loading")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.generate })).toBeNull();
    cleanup();
    setup({ status: "loadError", brief: null });
    expect(screen.getByText(messages.error.load)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: messages.generate })).toBeNull();
  });

  it("failed generation: message, Try again, previous brief kept; noFiles copy (AC-28, AC-9)", () => {
    const p = setup({ generateError: "failed" });
    expect(screen.getByText(messages.error.generate)).toBeInTheDocument();
    expect(screen.getByText("Adds the thing.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.error.retry }));
    expect(p.onGenerate).toHaveBeenCalled();
    cleanup();
    setup({ brief: null, generateError: "noFiles" });
    expect(screen.getByText(messages.error.noFiles)).toBeInTheDocument();
  });

  it("renders model markup as text (NFR-4)", () => {
    setup({ brief: { ...BRIEF, summary: "<img src=x onerror=alert(1)>" } });
    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("AC-5: no intent stated only when noIntent; specs statement shown either way", () => {
    setup({ noIntent: true });
    expect(screen.getByText(messages.inputs.noIntent)).toBeInTheDocument();
    expect(screen.getByText(messages.inputs.noSpecs)).toBeInTheDocument();
    cleanup();
    setup({ noIntent: false, intent: <div>INTENT-CARD</div> });
    expect(screen.queryByText(messages.inputs.noIntent)).toBeNull();
    expect(screen.getByText(messages.inputs.noSpecs)).toBeInTheDocument();
    cleanup();
    setup({ noIntent: false });
    expect(screen.queryByText(messages.inputs.noIntent)).toBeNull();
  });

  it("AC-31: the intent passed in is displayed inside the block, with a brief", () => {
    setup({ intent: <div>INTENT-CARD</div>, noIntent: false });
    expect(screen.getByText("INTENT-CARD")).toBeInTheDocument();
    expect(screen.queryByText(messages.inputs.noIntent)).toBeNull();
  });

  it("AC-31: the Intent block is present in every status of the block", () => {
    const cases: Partial<React.ComponentProps<typeof PrBriefBlock>>[] = [
      { status: "loading", brief: null },
      { status: "loadError", brief: null },
      { status: "ready", brief: null },
      { status: "ready" },
      { status: "ready", generating: true },
      { status: "ready", brief: null, generating: true },
    ];
    for (const c of cases) {
      setup({ ...c, intent: <div>INTENT-CARD</div> });
      expect(screen.getAllByText("INTENT-CARD")).toHaveLength(1);
      cleanup();
    }
  });
});

describe("visiblePath — control and bidi characters in a displayed path", () => {
  it("writes them as visible escapes and leaves an ordinary path alone", async () => {
    const { focusLabel, visiblePath } = await import("./helpers");
    expect(visiblePath("src/modules/brief/helpers.ts")).toBe("src/modules/brief/helpers.ts");
    expect(visiblePath("src/a‮gnp.ts")).toBe("src/a\\u{202e}gnp.ts");
    expect(visiblePath("src/a​b\nc.ts")).toBe("src/a\\u{200b}b\\u{a}c.ts");
    expect(focusLabel("src/a‮b.ts", 7)).toBe("src/a\\u{202e}b.ts:7");
  });
});

describe("AC-31: project documents the brief was given", () => {
  it("lists context_docs in stored order and hides the no-specs line", () => {
    setup({ brief: { ...BRIEF, context_docs: ["docs/a.md", "specs/b.md"] } });
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items.filter((x) => x === "docs/a.md" || x === "specs/b.md")).toEqual(["docs/a.md", "specs/b.md"]);
    expect(screen.queryByText(messages.inputs.noSpecs)).toBeNull();
  });

  it("shows the no-specs line for [] and for a brief without the field", () => {
    setup({ brief: { ...BRIEF, context_docs: [] } });
    expect(screen.getByText(messages.inputs.noSpecs)).toBeInTheDocument();
    cleanup();
    setup({ brief: { ...BRIEF, context_docs: undefined } });
    expect(screen.getByText(messages.inputs.noSpecs)).toBeInTheDocument();
  });

  it("prints a bidi override in a document path as an escape", () => {
    setup({ brief: { ...BRIEF, context_docs: ["docs/a\u202Eb.md"] } });
    expect(screen.getByText("docs/a\\u{202e}b.md")).toBeInTheDocument();
  });
});
