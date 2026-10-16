import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, PrReviewComment, ReviewRecord, SmartDiff } from "@devdigest/shared";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";

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
vi.mock("@/lib/hooks/evals", () => ({
  useCreateEvalCase: () => ({ mutate: vi.fn(), isPending: false }),
  useLoadEvalCaseDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useRunDraftCase: () => ({ mutate: vi.fn(), isPending: false }),
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
const sf = (path: string, finding_lines: number[] = []) => ({
  path,
  additions: 1,
  deletions: 0,
  finding_lines,
});
/** The smart-diff response; `lines` marks src/config.ts as having findings. */
const smartDiff = (lines: number[] = []): SmartDiff => ({
  groups: [
    { role: "core", files: [sf("src/config.ts", lines)] },
    { role: "tests", files: [sf("src/config.test.ts")] },
    { role: "wiring", files: [] },
    { role: "docs", files: [sf("README.md")] },
    { role: "boilerplate", files: [sf("pnpm-lock.yaml")] },
  ],
  split_suggestion: { too_big: false, total_lines: 4, proposed_splits: [] },
});
const SMART = smartDiff();

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
const review = (
  findings: FindingRecord[],
  over: { id?: string; agent_id?: string; created_at?: string } = {},
): ReviewRecord =>
  ({
    id: "r1",
    run_id: "run1",
    kind: "review",
    agent_id: "a1",
    agent_name: "Agent",
    created_at: "2026-10-11T10:00:00Z",
    findings,
    ...over,
  }) as unknown as ReviewRecord;

function renderTab(target?: { path: string; line: number | null }) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: prReviewMessages, shell: shellMessages, eval: evalMessages }}>
      <DiffTab
        prId="pr1"
        filesCount={FILES.length}
        files={FILES}
        canComment={false}
        repoFullName="acme/app"
        headSha="abc123"
        target={target}
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

  it("shows the five role labels and hints as literals", () => {
    renderTab();
    const copy: [string, string][] = [
      ["Core logic", "The substance of the change — review closely"],
      ["Tests", "Proves the change works — check what's covered"],
      ["Wiring", "Hooks the core into the app"],
      ["Docs", "Describes the change — read if behaviour changed"],
      ["Boilerplate", "Generated / mechanical — skim"],
    ];
    for (const [label, hint] of copy) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(hint)).toBeInTheDocument();
    }
  });

  it("keeps a card inside an initially collapsed group collapsed after the group opens", () => {
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /Boilerplate/ }));
    // the group is open and the card is there, but its diff body is not
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(screen.queryByText("added2")).toBeNull();
    fireEvent.click(screen.getByText("pnpm-lock.yaml"));
    expect(screen.getByText("added2")).toBeInTheDocument();
    // a group that starts open still shows its card bodies
    expect(screen.getByText("added3")).toBeInTheDocument();
  });

  it("exposes the order switch as a group whose chips flip aria-pressed", () => {
    renderTab();
    const group = screen.getByRole("group");
    const smartChip = within(group).getByRole("button", { name: "Smart order" });
    const originalChip = within(group).getByRole("button", { name: "Original order" });
    expect(smartChip).toHaveAttribute("aria-pressed", "true");
    expect(originalChip).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(originalChip);
    expect(smartChip).toHaveAttribute("aria-pressed", "false");
    expect(originalChip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(smartChip);
    expect(smartChip).toHaveAttribute("aria-pressed", "true");
    expect(originalChip).toHaveAttribute("aria-pressed", "false");
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
    state.smart = { data: smartDiff([2]) };
  });

  it("shows severity, title and rationale without a click, and counts files in the header", () => {
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("A secret is committed.")).toBeInTheDocument();
    // severity: the diff row's label, and the badge on the rendered card
    expect(document.querySelector("[data-finding-label]")).toHaveTextContent("blocker");
    const card = document.querySelector<HTMLElement>('[data-finding-id="f1"]')!;
    expect(card.querySelector("svg")).not.toBeNull();
    expect(card.querySelector("svg")).toHaveClass("lucide-octagon-alert");
    const core = screen.getByRole("button", { name: /Core logic/ });
    expect(core.querySelector("[data-findings-count]")).toHaveTextContent("1");
    expect(document.querySelectorAll("[data-finding-dot]")).toHaveLength(1);
    // only the core group has a file with findings
    expect(document.querySelectorAll("[data-findings-count]")).toHaveLength(1);
  });

  it("renders the Turn into eval case control on the finding card", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeInTheDocument();
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

describe("DiffTab counters come from the smart-diff response", () => {
  it("draws no dot and no counter when finding_lines is empty, even with finding cards", () => {
    state.reviews = [review([FINDING])];
    state.smart = { data: smartDiff([]) };
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(document.querySelector("[data-finding-dot]")).toBeNull();
    expect(document.querySelector("[data-findings-count]")).toBeNull();
  });

  it("draws the dot and counter from finding_lines alone, in one neutral colour", () => {
    state.reviews = [];
    state.smart = { data: smartDiff([2, 5]) };
    renderTab();
    const core = screen.getByRole("button", { name: /Core logic/ });
    expect(core.querySelector("[data-findings-count]")).toHaveTextContent("1");
    const dots = document.querySelectorAll("[data-finding-dot]");
    expect(dots).toHaveLength(1);
    expect(dots[0]).not.toHaveAttribute("data-severity");
  });

  it("draws no dots before smart-diff has loaded", () => {
    state.reviews = [review([FINDING])];
    state.smart = { isLoading: true };
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(document.querySelector("[data-finding-dot]")).toBeNull();
  });
});

describe("DiffTab review selection", () => {
  const OLD: FindingRecord = { ...FINDING, id: "old", title: "Old finding", review_id: "rOld" };
  const NEW: FindingRecord = { ...FINDING, id: "new", title: "New finding", review_id: "rNew" };

  it("renders only the newest review's finding when one agent has two reviews", () => {
    state.reviews = [
      review([OLD], { id: "rOld", created_at: "2026-10-11T08:00:00Z" }),
      review([NEW], { id: "rNew", created_at: "2026-10-11T10:00:00Z" }),
    ];
    renderTab();
    expect(screen.getByText("New finding")).toBeInTheDocument();
    expect(screen.queryByText("Old finding")).toBeNull();
  });

  it("keeps the newest review of each agent", () => {
    state.reviews = [
      review([OLD], { id: "rOld", agent_id: "a1", created_at: "2026-10-11T08:00:00Z" }),
      review([NEW], { id: "rNew", agent_id: "a2", created_at: "2026-10-11T07:00:00Z" }),
    ];
    renderTab();
    expect(screen.getByText("Old finding")).toBeInTheDocument();
    expect(screen.getByText("New finding")).toBeInTheDocument();
  });
});

describe("DiffTab dismissed findings", () => {
  const DISMISSED: FindingRecord = { ...FINDING, dismissed_at: "2026-10-11T11:00:00Z" };

  it("keeps a dismissed finding in the diff, tagged, and still counts it", () => {
    state.reviews = [review([DISMISSED])];
    state.smart = { data: smartDiff([2]) };
    renderTab();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(document.querySelector('[data-finding-id="f1"]')).toHaveTextContent("dismissed");
    // counted: the comments button, the group counter and the file dot
    expect(screen.getByRole("button", { name: /Hide comments \(1\)/ })).toBeInTheDocument();
    const core = screen.getByRole("button", { name: /Core logic/ });
    expect(core.querySelector("[data-findings-count]")).toHaveTextContent("1");
    expect(document.querySelectorAll("[data-finding-dot]")).toHaveLength(1);
  });
});

describe("DiffTab findings on files outside the PR", () => {
  it("renders no card and does not count a finding whose path is not in files", () => {
    state.reviews = [review([{ ...FINDING, file: "src/not-in-this-pr.ts" }])];
    state.smart = { data: smartDiff([2]) };
    renderTab();
    expect(screen.queryByText("Hardcoded secret")).toBeNull();
    expect(document.querySelector("[data-finding-id]")).toBeNull();
    expect(screen.queryByRole("button", { name: /comments/i })).toBeNull();
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

describe("DiffTab target", () => {
  it("opens the collapsed docs group and the targeted card, leaving boilerplate collapsed", () => {
    Element.prototype.scrollIntoView = vi.fn();
    renderTab({ path: "README.md", line: 2 });
    expect(document.querySelector('[data-role-group="docs"]')).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector('[data-role-group="boilerplate"]')).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("added1")).toBeInTheDocument();
    expect(screen.queryByText("added2")).toBeNull();
  });
});
