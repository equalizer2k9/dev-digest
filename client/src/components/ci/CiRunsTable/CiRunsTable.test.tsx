import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRunRow } from "@devdigest/shared";
import messages from "../../../../messages/en/ci.json";
import { CiRunsTable } from "./CiRunsTable";
import { formatCost } from "@/lib/cost";
import { formatDuration, statusKey } from "./helpers";

afterEach(cleanup);

const row = (extra: Partial<CiRunRow> = {}): CiRunRow => ({
  id: "r1",
  repo: "acme/payments-api",
  pr_number: 42,
  agent_id: "a1",
  agent: "Security reviewer",
  status: "succeeded",
  findings_count: 3,
  cost_usd: 0.0123,
  duration_s: 75,
  ran_at: "2026-05-01T10:00:00.000Z",
  github_url: "https://github.com/acme/payments-api/actions/runs/99",
  ...extra,
});

const wrap = (runs: CiRunRow[]) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsTable runs={runs} />
    </NextIntlClientProvider>,
  );

describe("CiRunsTable", () => {
  it("shows every column of a row and a safe new-tab link", () => {
    wrap([row()]);
    expect(screen.getAllByRole("columnheader")).toHaveLength(9);
    expect(screen.getByText("acme/payments-api")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
    expect(screen.getByText("Security reviewer")).toBeInTheDocument();
    expect(screen.getByText(messages.runs.status.succeeded)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$0.012")).toBeInTheDocument();
    expect(screen.getByText("1m 15s")).toBeInTheDocument();
    expect(screen.getByText(new Date("2026-05-01T10:00:00.000Z").toLocaleString())).toBeInTheDocument();
    const link = screen.getByRole("link", { name: messages.runs.openRun });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/actions/runs/99");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("renders a missing agent as the placeholder", () => {
    wrap([row({ agent: null, agent_id: null })]);
    expect(screen.getByText(messages.runs.agentNone)).toBeInTheDocument();
  });

  it("renders hostile repo and agent names as text, never as an element", () => {
    const evil = "<img src=x onerror=alert(1)>";
    wrap([row({ repo: evil, agent: evil })]);
    expect(screen.getAllByText(evil)).toHaveLength(2);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("does not link a non-https url", () => {
    wrap([row({ github_url: "javascript:alert(1)" })]);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("keeps the given row order", () => {
    wrap([row({ id: "a", pr_number: 2 }), row({ id: "b", pr_number: 1 }), row({ id: "c", pr_number: 3 })]);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByText(/^#\d$/).textContent)).toEqual(["#2", "#1", "#3"]);
  });

  it("shows em dashes for null values and a raw label for an unknown status", () => {
    wrap([row({ cost_usd: null, duration_s: null, ran_at: null, github_url: null, status: "weird", pr_number: null })]);
    expect(screen.getByText("weird")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByText(/\$0\.00/)).toBeNull();
  });
});

describe("helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(8)).toBe("8s");
    expect(formatDuration(75)).toBe("1m 15s");
  });
  it("formats cost without inventing $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(0.0123)).toBe("$0.012");
    // A real CI run on PR #26 cost $0.00049714 and showed "$0.000".
    expect(formatCost(0.00049714)).toBe("$0.0005");
    expect(formatCost(0)).toBe("$0.000");
  });
  it("maps statuses to message keys", () => {
    expect(statusKey("succeeded")).toBe("runs.status.succeeded");
    expect(statusKey("no_findings")).toBe("runs.status.noFindings");
    expect(statusKey("failed")).toBe("runs.status.failed");
    expect(statusKey("weird")).toBeNull();
    expect(statusKey(null)).toBeNull();
  });
});
