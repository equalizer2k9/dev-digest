import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingGroup, GroupMember, MultiRunAgent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";
import prReviewMessages from "../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../messages/en/eval.json";

const mutate = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRunFindingAction: () => ({ mutate, isPending: false }),
}));
vi.mock("@/components/eval/EvalCaseButton", () => ({
  EvalCaseButton: () => <span data-testid="eval-btn" />,
}));

import { FindingGroups } from "./FindingGroups";

afterEach(cleanup);
vi.clearAllMocks();

const member = (id: string, run_id: string, extra: Partial<GroupMember> = {}): GroupMember => ({
  id,
  run_id,
  review_id: "rv",
  severity: "WARNING",
  category: "bug",
  title: `Title ${id}`,
  file: "src/a.ts",
  start_line: 10,
  end_line: 14,
  rationale: "why",
  suggestion: null,
  confidence: 0.9,
  accepted_at: null,
  dismissed_at: null,
  ...extra,
});

const agents: MultiRunAgent[] = ["r1", "r2"].map((run_id, i) => ({
  run_id,
  agent_id: `a${i}`,
  agent_name: i === 0 ? "Security" : null,
  status: "done",
  error: null,
  duration_ms: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0,
  findings_count: 1,
  score: 1,
}));

const group = (members: GroupMember[]): FindingGroup => ({
  id: members[0]!.id,
  representative: members[0]!,
  members,
  cells: [],
  conflict: false,
});

const wrap = (groups: FindingGroup[]) =>
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ multiAgent: messages, prReview: prReviewMessages, eval: evalMessages }}
    >
      <FindingGroups groups={groups} agents={agents} multiRunId="m1" />
    </NextIntlClientProvider>,
  );

describe("FindingGroups", () => {
  it("shows the representative and the group's agents; expanding shows one FindingCard per member (AC-9)", () => {
    const g = group([member("f1", "r1"), member("f2", "r2")]);
    const { container } = wrap([g]);
    expect(screen.getByText("Title f1")).toBeInTheDocument();
    expect(screen.getByText("src/a.ts:10–14")).toBeInTheDocument();
    expect(screen.getByText(`${messages.groups.agentsLabel}: Security, ${messages.column.deletedAgent}`)).toBeInTheDocument();
    expect(container.querySelectorAll("[data-finding-id]")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /Title f1/ }));
    expect(container.querySelectorAll("[data-finding-id]")).toHaveLength(2);
    expect(screen.getAllByTestId("eval-btn")).toHaveLength(2);
  });

  it("Accept on a member calls the finding action with its id", () => {
    wrap([group([member("f1", "r1")])]);
    fireEvent.click(screen.getByRole("button", { name: /Title f1/ }));
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ findingId: "f1", action: "accept" }));
  });

  it("a title containing <img src=x onerror=…> renders as text, no img (NFR-9)", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = wrap([group([member("f1", "r1", { title: evil })])]);
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("empty state with zero groups (EC-5)", () => {
    wrap([]);
    expect(screen.getByText(messages.groups.empty)).toBeInTheDocument();
  });
});
