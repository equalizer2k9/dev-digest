import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CellValue, FindingGroup, GroupMember, MultiRunAgent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/multiAgent.json";

const apiGet = vi.fn();
vi.mock("@/lib/api", () => ({ api: { get: (...a: unknown[]) => apiGet(...a) }, API_BASE: "" }));
const useMultiRun = vi.fn();
vi.mock("@/lib/hooks/multi-agent", () => ({ useMultiRun: (...a: unknown[]) => useMultiRun(...a) }));

import { DisagreementsSection } from "./DisagreementsSection";

afterEach(cleanup);

const agents: MultiRunAgent[] = ["r1", "r2", "r3", "r4"].map((run_id, i) => ({
  run_id,
  agent_id: `a${i}`,
  agent_name: `Agent ${i + 1}`,
  status: "done",
  error: null,
  duration_ms: 1,
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0,
  findings_count: 1,
  score: 1,
}));

const member = (id: string): GroupMember => ({
  id,
  run_id: "r1",
  review_id: "rv",
  severity: "WARNING",
  category: "bug",
  title: `Title ${id}`,
  file: "a.ts",
  start_line: 1,
  end_line: 2,
  rationale: "",
  suggestion: null,
  confidence: 1,
  accepted_at: null,
  dismissed_at: null,
});

const group = (id: string, values: CellValue[], conflict: boolean): FindingGroup => ({
  id,
  representative: member(id),
  members: [member(id)],
  cells: values.map((value, i) => ({ run_id: `r${i + 1}`, value })),
  conflict,
});

const G1 = group("g1", ["CRITICAL", "did_not_flag", "failed", "pending"], true);
const G2 = group("g2", ["WARNING", "WARNING", "WARNING", "WARNING"], false);

const wrap = (groups: FindingGroup[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <DisagreementsSection groups={groups} agents={agents} />
    </NextIntlClientProvider>,
  );

const rowOf = (id: string) => document.querySelector<HTMLElement>(`tr[data-group-id="${id}"]`)!;

describe("DisagreementsSection", () => {
  it("one cell per agent with severity / did not flag / failed / pending copy (AC-10)", () => {
    wrap([G1]);
    const cells = within(rowOf("g1")).getAllByRole("cell").slice(1).map((c) => c.textContent);
    expect(cells).toEqual([
      messages.cell.CRITICAL,
      messages.cell.did_not_flag,
      messages.cell.failed,
      messages.cell.pending,
    ]);
  });

  it("conflict groups are marked (AC-10)", () => {
    wrap([G1, G2]);
    expect(within(rowOf("g1")).getByText(messages.disagree.conflict)).toBeInTheDocument();
    expect(within(rowOf("g2")).queryByText(messages.disagree.conflict)).not.toBeInTheDocument();
  });

  it('"Show only conflicts" on → only conflict groups; off → all again (AC-11)', () => {
    wrap([G1, G2]);
    const toggle = screen.getByRole("switch", { name: messages.disagree.onlyConflicts });
    fireEvent.click(toggle);
    expect(rowOf("g1")).toBeTruthy();
    expect(document.querySelector('tr[data-group-id="g2"]')).toBeNull();
    fireEvent.click(toggle);
    expect(rowOf("g2")).toBeTruthy();
  });

  it("toggling issues no request (AC-11)", () => {
    wrap([G1, G2]);
    fireEvent.click(screen.getByRole("switch", { name: messages.disagree.onlyConflicts }));
    expect(apiGet).not.toHaveBeenCalled();
    expect(useMultiRun).not.toHaveBeenCalled();
  });

  it("toggle on with no conflicts → noConflicts empty state", () => {
    wrap([G2]);
    fireEvent.click(screen.getByRole("switch", { name: messages.disagree.onlyConflicts }));
    expect(screen.getByText(messages.disagree.noConflicts)).toBeInTheDocument();
  });

  it("no groups → empty state", () => {
    wrap([]);
    expect(screen.getByText(messages.disagree.empty)).toBeInTheDocument();
  });
});
