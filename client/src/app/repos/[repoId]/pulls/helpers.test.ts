/**
 * latestFindingsPerAgent — the client half of the list's `findings_counts`
 * rule: one review per agent (the newest), findings sorted by severity. The
 * hover preview and the chips disagree the moment these two drift apart.
 */
import { describe, it, expect } from "vitest";
import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { latestFindingsPerAgent } from "./helpers";

function finding(over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "rv1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

function review(over: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "rv1",
    pr_id: "pr1",
    agent_id: null,
    run_id: null,
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    cost_usd: null,
    tokens_in: null,
    tokens_out: null,
    created_at: "2026-08-01T10:00:00Z",
    findings: [],
    ...over,
  };
}

describe("latestFindingsPerAgent", () => {
  it("keeps only each agent's newest review and sorts findings by severity", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "old-a1",
        agent_id: "a1",
        created_at: "2026-08-01T09:00:00Z",
        findings: [finding({ id: "stale", severity: "CRITICAL" })],
      }),
      review({
        id: "new-a1",
        agent_id: "a1",
        created_at: "2026-08-01T10:00:00Z",
        findings: [finding({ id: "w1", severity: "WARNING" })],
      }),
      review({
        id: "new-a2",
        agent_id: "a2",
        created_at: "2026-08-01T09:30:00Z",
        findings: [
          finding({ id: "s1", severity: "SUGGESTION" }),
          finding({ id: "c1", severity: "CRITICAL" }),
        ],
      }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id)).toEqual(["c1", "w1", "s1"]);
  });

  it("treats agent-less reviews as one agent, so only the newest survives", () => {
    const reviews: ReviewRecord[] = [
      review({ id: "a", created_at: "2026-08-01T09:00:00Z", findings: [finding({ id: "old" })] }),
      review({ id: "b", created_at: "2026-08-01T11:00:00Z", findings: [finding({ id: "new" })] }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id)).toEqual(["new"]);
  });

  it("ignores summary-kind reviews", () => {
    const reviews: ReviewRecord[] = [
      review({
        id: "sum",
        kind: "summary",
        created_at: "2026-08-01T11:00:00Z",
        findings: [finding({ id: "x" })],
      }),
      review({ id: "rev", created_at: "2026-08-01T10:00:00Z", findings: [finding({ id: "y" })] }),
    ];
    expect(latestFindingsPerAgent(reviews).map((f) => f.id)).toEqual(["y"]);
  });

  it("does not mutate the reviews it was given", () => {
    const reviews: ReviewRecord[] = [
      review({ id: "a", agent_id: "a1", created_at: "2026-08-01T09:00:00Z" }),
      review({ id: "b", agent_id: "a2", created_at: "2026-08-01T11:00:00Z" }),
    ];
    latestFindingsPerAgent(reviews);
    expect(reviews.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("returns empty for no reviews", () => {
    expect(latestFindingsPerAgent([])).toEqual([]);
  });
});
