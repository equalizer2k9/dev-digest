import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

/** 2 CRITICAL (one low-confidence) + 1 low-confidence WARNING. */
const LOW_CONF: FindingRecord[] = [
  FINDINGS[0]!,
  { ...FINDINGS[0]!, id: "f4", severity: "CRITICAL", title: "Weak hash", confidence: 0.2 },
  { ...FINDINGS[0]!, id: "f5", severity: "WARNING", title: "Broad catch", confidence: 0.2 },
];

/** A mixed-severity run: 1 CRITICAL, 2 WARNING, 0 SUGGESTION. */
const MIXED: FindingRecord[] = [
  FINDINGS[0]!,
  { ...FINDINGS[0]!, id: "f2", severity: "WARNING", title: "Unhandled rejection" },
  { ...FINDINGS[0]!, id: "f3", severity: "WARNING", title: "Missing timeout" },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

/** The id of the card carrying the j/k focus ring, or null when none is focused. */
function focusedFindingId(scope: HTMLElement): string | null {
  const cards = [...scope.querySelectorAll<HTMLElement>("[data-finding-id]")];
  const hit = cards.find((el) => el.style.boxShadow && el.style.boxShadow !== "none");
  return hit?.dataset.findingId ?? null;
}

const counters = () => screen.getByRole("group", { name: "Findings by severity" });
const counter = (name: string) => screen.getByRole("button", { name });

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("renders one counter per severity present, with its count", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const row = counters();
    expect(within(row).getByText("Critical")).toBeInTheDocument();
    expect(within(row).getByText("Warning")).toBeInTheDocument();
    expect(within(row).getAllByRole("button")).toHaveLength(2);
    expect(within(counter("Show only Critical findings")).getByText("1")).toBeInTheDocument();
    expect(within(counter("Show only Warning findings")).getByText("2")).toBeInTheDocument();
  });

  it("omits a severity with no findings in this run", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(within(counters()).queryByText("Suggestion")).not.toBeInTheDocument();
  });

  it("renders no counter row when the run has no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).not.toBeInTheDocument();
  });

  it("filters the list to one severity when its counter is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter("Show only Critical findings"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Unhandled rejection")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing timeout")).not.toBeInTheDocument();
  });

  it("clears the filter when the selected counter is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter("Show only Critical findings"));
    fireEvent.click(counter("Show all severities"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unhandled rejection")).toBeInTheDocument();
  });

  it("switches the filter when a different counter is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter("Show only Critical findings"));
    fireEvent.click(counter("Show only Warning findings"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("Unhandled rejection")).toBeInTheDocument();
  });

  it("marks the selected counter as pressed", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(counter("Show only Critical findings")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(counter("Show only Critical findings"));
    expect(counter("Show all severities")).toHaveAttribute("aria-pressed", "true");
  });

  it("counts only high-confidence findings once hide-low-confidence is on", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CONF} prId="pr1" />);
    expect(within(counter("Show only Critical findings")).getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch"));
    expect(within(counter("Show only Critical findings")).getByText("1")).toBeInTheDocument();
  });

  it("clears a filter whose severity stops being available", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CONF} prId="pr1" />);
    fireEvent.click(counter("Show only Warning findings"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    // The only WARNING is low-confidence, so hiding those removes the severity.
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByRole("button", { name: "Show all severities" })).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("resets keyboard focus to the top of the list when the filter changes", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // Sorted CRITICAL-first: f1, f2, f3. Two "j" presses focus the last card.
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    expect(focusedFindingId(container)).toBe("f3");

    // Filtering to WARNING leaves [f2, f3]; without a reset the index would
    // still be 2 and nothing would be focused.
    fireEvent.click(counter("Show only Warning findings"));
    expect(focusedFindingId(container)).toBe("f2");
  });

  it("keeps each run's counters and filter independent", () => {
    const { container } = renderWithIntl(
      <>
        <FindingsPanel findings={MIXED} prId="pr1" />
        <FindingsPanel findings={MIXED} prId="pr2" />
      </>,
    );
    const [first, second] = [...container.children] as HTMLElement[];

    // Two runs filtered to different severities at the same time.
    fireEvent.click(within(first!).getByRole("button", { name: "Show only Critical findings" }));
    fireEvent.click(within(second!).getByRole("button", { name: "Show only Warning findings" }));
    // Re-render both panels (every MIXED finding is high-confidence, so this
    // changes nothing on its own). Shared filter state would surface here as
    // one panel adopting the other's severity.
    fireEvent.click(within(first!).getByRole("switch"));
    fireEvent.click(within(second!).getByRole("switch"));

    expect(within(first!).getByText("Hardcoded secret")).toBeInTheDocument();
    expect(within(first!).queryByText("Unhandled rejection")).not.toBeInTheDocument();

    expect(within(second!).getByText("Unhandled rejection")).toBeInTheDocument();
    expect(within(second!).queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("keeps the counts unchanged while a filter is active", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(counter("Show only Critical findings"));
    expect(within(counter("Show all severities")).getByText("1")).toBeInTheDocument();
    expect(within(counter("Show only Warning findings")).getByText("2")).toBeInTheDocument();
  });
});
