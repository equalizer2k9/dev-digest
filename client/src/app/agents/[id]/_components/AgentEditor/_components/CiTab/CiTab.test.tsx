import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, CiInstallation, CiRunRow } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/ci.json";

const updateMutate = vi.fn();
const installs: { data: CiInstallation[] } = { data: [] };
const runs: { data: { runs: CiRunRow[] } } = { data: { runs: [] } };
const useCiRuns = vi.fn((_agentId?: string) => ({ ...runs, isLoading: false, isError: false }));

vi.mock("../../../../../../../lib/hooks/ci", () => ({
  useCiInstallations: () => ({ ...installs, isLoading: false }),
  useCiRuns: (id?: string) => useCiRuns(id),
  usePreviewCi: () => ({ mutate: vi.fn(), data: undefined, error: null, isPending: false }),
  useInstallCi: () => ({ mutate: vi.fn(), data: undefined, error: null, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/core", () => ({ useRepos: () => ({ data: [] }) }));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: updateMutate, isPending: false }),
}));

import { CiTab } from "./CiTab";

afterEach(cleanup);
beforeEach(() => {
  updateMutate.mockReset();
  useCiRuns.mockClear();
  installs.data = [];
  runs.data = { runs: [] };
});

const AGENT = { id: "ag1", name: "Security reviewer", ci_fail_on: "critical" } as Agent;
const mount = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ ci: messages }}>
      <CiTab agent={AGENT} />
    </NextIntlClientProvider>,
  );

describe("CiTab", () => {
  it("lists the installations, or the empty copy", () => {
    installs.data = [
      { id: "i1", agent_id: "ag1", repo: "acme/payments-api", target_type: "gha", installed_at: "2026-05-01T10:00:00.000Z" },
    ];
    const { unmount } = mount();
    expect(screen.getByText(/acme\/payments-api/)).toBeInTheDocument();
    expect(screen.queryByText(messages.ciTab.noInstallations)).toBeNull();
    unmount();
    installs.data = [];
    mount();
    expect(screen.getByText(messages.ciTab.noInstallations)).toBeInTheDocument();
  });

  it("saves a changed Fail CI on through the agent update and shows the note", () => {
    mount();
    expect(screen.getByText(messages.ciTab.failOnNote)).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "warning" } });
    expect(updateMutate).toHaveBeenCalledWith({ id: "ag1", patch: { ci_fail_on: "warning" } });
  });

  it("reads this agent's runs and renders them", () => {
    runs.data = {
      runs: [
        {
          id: "r1",
          repo: "acme/kept-repo",
          pr_number: 5,
          agent_id: "ag1",
          agent: "Security reviewer",
          status: "succeeded",
          findings_count: 2,
          cost_usd: 0.01,
          duration_s: 3,
          ran_at: "2026-05-01T10:00:00.000Z",
          github_url: "https://github.com/acme/kept-repo/actions/runs/1",
        },
      ],
    };
    mount();
    expect(useCiRuns).toHaveBeenCalledWith("ag1");
    expect(screen.getByText("acme/kept-repo")).toBeInTheDocument();
  });

  it("shows the no-runs copy when there are none", () => {
    mount();
    expect(screen.getByText(messages.ciTab.noRuns)).toBeInTheDocument();
  });

  it("Add to CI opens the wizard on its first step", () => {
    mount();
    expect(screen.queryByText(messages.exportWizard.title)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: messages.exportWizard.addToCi }));
    expect(screen.getByText(messages.exportWizard.title)).toBeInTheDocument();
    expect(screen.getByText(messages.exportWizard.targets.gha)).toBeInTheDocument();
  });
});
