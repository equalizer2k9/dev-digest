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

/** Top row: read-only counter pills. */
const counters = () => screen.getByRole("group", { name: "Findings by severity" });
const pill = (sev: string) => counters().querySelector<HTMLElement>(`[data-severity="${sev}"]`);

/** Bottom row: the severity filter chips, found by their visible label. */
const filters = () => screen.getByRole("group", { name: "Filter by severity" });
const chip = (label: string) => within(filters()).getByRole("button", { name: label });

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
    expect(pill("CRITICAL")).toHaveTextContent("1");
    expect(pill("WARNING")).toHaveTextContent("2");
  });

  it("omits a severity with no findings in this run", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill("SUGGESTION")).toBeNull();
  });

  it("renders no counter row when the run has no findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).not.toBeInTheDocument();
  });

  it("draws a counter as icon + number, with no severity label", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(within(counters()).queryByText("Critical")).not.toBeInTheDocument();
    expect(within(counters()).queryByText("Warning")).not.toBeInTheDocument();
    expect(pill("CRITICAL")!.querySelector("svg")).toBeInTheDocument();
  });

  it("underlines a counter with a dotted border in its severity colour", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(pill("CRITICAL")!.style.borderBottom).toBe("1px dotted var(--crit)");
    expect(pill("WARNING")!.style.borderBottom).toBe("1px dotted var(--warn)");
  });

  it("does not make the counters clickable", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(within(counters()).queryAllByRole("button")).toHaveLength(0);
  });

  it("counts only high-confidence findings once hide-low-confidence is on", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CONF} prId="pr1" />);
    expect(pill("CRITICAL")).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("switch"));
    expect(pill("CRITICAL")).toHaveTextContent("1");
  });

  it("keeps the counts unchanged while a filter is active", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    expect(pill("CRITICAL")).toHaveTextContent("1");
    expect(pill("WARNING")).toHaveTextContent("2");
  });
});

describe("FindingsPanel severity filter", () => {
  it("renders all three chips even when a severity has no findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // MIXED has no SUGGESTION, yet its chip is still on offer.
    expect(chip("Critical")).toBeInTheDocument();
    expect(chip("Warning")).toBeInTheDocument();
    expect(chip("Suggestion")).toBeInTheDocument();
    expect(within(filters()).getAllByRole("button")).toHaveLength(3);
  });

  it("renders all three chips when the run has no findings at all", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(within(filters()).getAllByRole("button")).toHaveLength(3);
  });

  it("carries no count on a chip — the numbers live in the counter row", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(chip("Warning")).toHaveTextContent(/^Warning$/);
  });

  it("filters the list to one severity when its chip is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Unhandled rejection")).not.toBeInTheDocument();
    expect(screen.queryByText("Missing timeout")).not.toBeInTheDocument();
  });

  it("clears the filter when the active chip is clicked again", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Critical"));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unhandled rejection")).toBeInTheDocument();
  });

  it("switches the filter when a different chip is clicked", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Critical"));
    fireEvent.click(chip("Warning"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.getByText("Unhandled rejection")).toBeInTheDocument();
  });

  it("reports the selected chip as pressed, and only that one", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(chip("Critical")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Critical"));
    expect(chip("Critical")).toHaveAttribute("aria-pressed", "true");
    expect(chip("Warning")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(chip("Critical"));
    expect(chip("Critical")).toHaveAttribute("aria-pressed", "false");
  });

  it("never presses a chip for a severity with no findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(chip("Suggestion"));
    // Derived, not synced: the chip cannot light up for a frame and roll back.
    expect(chip("Suggestion")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("Unhandled rejection")).toBeInTheDocument();
  });

  it("drops a filter whose severity stops being available", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CONF} prId="pr1" />);
    fireEvent.click(chip("Warning"));
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();

    // The only WARNING is low-confidence, so hiding those removes the severity.
    fireEvent.click(screen.getByRole("switch"));
    expect(chip("Warning")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("re-applies the filter when its severity comes back", () => {
    renderWithIntl(<FindingsPanel findings={LOW_CONF} prId="pr1" />);
    fireEvent.click(chip("Warning"));
    fireEvent.click(screen.getByRole("switch")); // hides the only WARNING
    fireEvent.click(screen.getByRole("switch")); // brings it back

    // The reviewer never cleared the filter — the confidence toggle suspended it,
    // so restoring the finding restores the filter too.
    expect(chip("Warning")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Broad catch")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("resets keyboard focus to the top of the list when the filter changes", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // Sorted CRITICAL-first: f1, f2, f3. Two "j" presses focus the last card.
    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "j" });
    expect(focusedFindingId(container)).toBe("f3");

    // Filtering to WARNING leaves [f2, f3]; without a reset the index would
    // still be 2 and nothing would be focused.
    fireEvent.click(chip("Warning"));
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
    fireEvent.click(within(first!).getByRole("button", { name: "Critical" }));
    fireEvent.click(within(second!).getByRole("button", { name: "Warning" }));
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
});
