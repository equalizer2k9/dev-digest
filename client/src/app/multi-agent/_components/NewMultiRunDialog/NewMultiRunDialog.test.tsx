import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/multiAgent.json";

const push = vi.fn();
const launchMutate = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/core", () => ({
  useRepos: () => ({ data: [{ id: "repo1", full_name: "acme/api" }] }),
  usePulls: (id: string | null) => ({
    data: id ? [{ id: "pr9", number: 9, title: "Fix it" }] : undefined,
  }),
}));
vi.mock("@/lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: {
      agents: [
        { agent_id: "a1", agent_name: "Security", duration_ms: 1000, cost_usd: 0.01, runs: 1 },
        { agent_id: "a2", agent_name: "Style", duration_ms: 2000, cost_usd: 0.02, runs: 1 },
      ],
    },
    isLoading: false,
  }),
  useLaunchMultiRun: () => ({ mutateAsync: launchMutate, isPending: false }),
}));

import { NewMultiRunDialog } from "./NewMultiRunDialog";

afterEach(cleanup);

describe("NewMultiRunDialog", () => {
  it("after choosing a PR the picker is shown; launching posts that PR id with the ticked agentIds and navigates (AC-1, A-9)", async () => {
    launchMutate.mockResolvedValue({ pr_id: "pr9", runs: [], reviews: [], multi_run_id: "m5" });
    render(
      <NextIntlClientProvider locale="en" messages={{ multiAgent: messages }}>
        <NewMultiRunDialog onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[0]!, { target: { value: "repo1" } });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByRole("combobox")[1]!, { target: { value: "pr9" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Style/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/multi-agent/m5"));
    expect(launchMutate).toHaveBeenCalledWith({ prId: "pr9", agentIds: ["a1", "a2"] });
  });
});
