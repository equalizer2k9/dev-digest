import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { MultiRunListItem } from "@devdigest/shared";
import messages from "../../../../../messages/en/multiAgent.json";

const state: { data?: MultiRunListItem[]; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};
vi.mock("@/lib/hooks/multi-agent", () => ({
  useMultiRuns: () => ({ ...state, refetch: vi.fn() }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../NewMultiRunDialog", () => ({
  NewMultiRunDialog: () => <div role="dialog">dialog</div>,
}));

import { MultiRunListView } from "./MultiRunListView";

afterEach(cleanup);
beforeEach(() => {
  state.data = [];
  state.isLoading = false;
  state.isError = false;
});

const item = (id: string, extra: Partial<MultiRunListItem> = {}): MultiRunListItem => ({
  id,
  pr: { id: `pr-${id}`, number: Number(id.replace("m", "")), title: `PR title ${id}`, repo_id: "r1" },
  agents: [
    { agent_id: "a1", agent_name: "Security" },
    { agent_id: null, agent_name: null },
  ],
  status: "done",
  wall_clock_ms: 75000,
  cost_usd: 0.0123,
  started_at: "2026-10-16T10:00:00.000Z",
  ...extra,
});

const wrap = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
      <MultiRunListView />
    </NextIntlClientProvider>,
  );

describe("MultiRunListView", () => {
  it("renders one row per run in the order received with PR, agents, status, wall-clock, cost, start time (AC-12)", () => {
    state.data = [
      item("m2", { wall_clock_ms: null, cost_usd: null, status: "running" }),
      item("m1"),
    ];
    wrap();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("#2 PR title m2");
    expect(rows[1]).toHaveTextContent("#1 PR title m1");
    expect(rows[1]).toHaveTextContent(`Security, ${messages.column.deletedAgent}`);
    expect(rows[1]).toHaveTextContent(messages.page.status.done);
    expect(rows[1]).toHaveTextContent("1m 15s");
    expect(rows[1]).toHaveTextContent("$0.012");
    expect(rows[1]).toHaveTextContent(new Date("2026-10-16T10:00:00.000Z").toLocaleString());
    expect(rows[0]).toHaveTextContent(messages.page.status.running);
    const cells = within(rows[0]!).getAllByRole("cell");
    expect([cells[3]!.textContent, cells[4]!.textContent]).toEqual(["—", "—"]);
  });

  it("each row links to /multi-agent/<id>", () => {
    state.data = [item("m3")];
    wrap();
    expect(screen.getByRole("link", { name: "#3 PR title m3" })).toHaveAttribute("href", "/multi-agent/m3");
  });

  it("empty state when the list is empty", () => {
    wrap();
    expect(screen.getByText(messages.list.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: messages.list.emptyCta })).toBeInTheDocument();
  });

  it('"New multi-agent review" opens the dialog', () => {
    wrap();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: messages.list.new }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
