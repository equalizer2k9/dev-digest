import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { CiRefreshResult, CiRunRow } from "@devdigest/shared";
import messages from "../../../../../messages/en/ci.json";

const mutate = vi.fn();
const refresh: { isPending: boolean; data?: CiRefreshResult; error: Error | null } = {
  isPending: false,
  error: null,
};
const runsState: { data?: { runs: CiRunRow[] }; isLoading: boolean; isError: boolean } = {
  isLoading: false,
  isError: false,
};

vi.mock("@/lib/hooks/ci", () => ({
  useCiRuns: () => ({ ...runsState, refetch: vi.fn() }),
  useRefreshCiRuns: () => ({ mutate, ...refresh }),
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CiRunsView } from "./CiRunsView";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
  refresh.isPending = false;
  refresh.data = undefined;
  refresh.error = null;
  runsState.data = { runs: [] };
  runsState.isLoading = false;
  runsState.isError = false;
});

const run = (id: string, repo: string): CiRunRow => ({
  id,
  repo,
  pr_number: 1,
  agent_id: "a1",
  agent: "Sec",
  status: "succeeded",
  findings_count: 1,
  cost_usd: 0.01,
  duration_s: 5,
  ran_at: "2026-05-01T10:00:00.000Z",
  github_url: "https://github.com/acme/api/actions/runs/1",
});

const mount = (strict = false) => {
  const tree = (
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiRunsView />
    </NextIntlClientProvider>
  );
  return render(strict ? <React.StrictMode>{tree}</React.StrictMode> : tree);
};

describe("CiRunsView", () => {
  it("ingests once on mount, even under StrictMode, and again on each Refresh click", () => {
    mount(true);
    expect(mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: messages.runs.refresh }));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it("disables Refresh with the busy label while the mutation is pending", () => {
    refresh.isPending = true;
    mount();
    expect(screen.getByRole("button", { name: messages.runs.refreshing })).toBeDisabled();
  });

  it("keeps the rows and shows the error text above them when the refresh reports an error", () => {
    runsState.data = { runs: [run("r1", "acme/kept-repo")] };
    refresh.data = { runs: [], error: "GitHub down", ingested: 0, skipped: 0 };
    mount();
    expect(screen.getByText(/GitHub down/)).toBeInTheDocument();
    expect(screen.getByText("acme/kept-repo")).toBeInTheDocument();
  });

  it("shows a mutation error as a notice and keeps the rows", () => {
    runsState.data = { runs: [run("r1", "acme/kept-repo")] };
    refresh.error = new Error("boom");
    mount();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByText("acme/kept-repo")).toBeInTheDocument();
  });

  it("shows the empty copy for an empty list", () => {
    mount();
    expect(screen.getByText(messages.runs.emptyTitle)).toBeInTheDocument();
  });

  it("shows the loading copy while loading", () => {
    runsState.data = undefined;
    runsState.isLoading = true;
    mount();
    expect(screen.getByText(messages.runs.loading)).toBeInTheDocument();
    expect(screen.queryByText(messages.runs.emptyTitle)).toBeNull();
  });
});
