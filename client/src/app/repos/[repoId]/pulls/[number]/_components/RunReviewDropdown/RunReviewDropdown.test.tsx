import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/prReview.json";
import multiAgentMessages from "../../../../../../../../messages/en/multiAgent.json";
import { ApiError } from "../../../../../../../lib/api";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  runMutate: vi.fn(),
  launchMutate: vi.fn(),
  latest: { current: [] as unknown[] },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn() }),
}));
vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgents: () => ({ data: [{ id: "a1", name: "Security", model: "gpt-4.1", enabled: true }] }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunReview: () => ({ mutateAsync: h.runMutate, isPending: false }),
}));
vi.mock("../../../../../../../lib/hooks/multi-agent", () => ({
  useAgentEstimates: () => ({
    data: {
      agents: [
        { agent_id: "a1", agent_name: "Security", duration_ms: 10000, cost_usd: 0.01, runs: 2 },
        { agent_id: "a2", agent_name: "Performance", duration_ms: null, cost_usd: null, runs: 0 },
        { agent_id: "a3", agent_name: "Style", duration_ms: 5000, cost_usd: 0.02, runs: 1 },
      ],
    },
    isLoading: false,
  }),
  useLaunchMultiRun: () => ({ mutateAsync: h.launchMutate, isPending: false }),
  useMultiRuns: () => ({ data: h.latest.current }),
}));

import { RunReviewDropdown } from "./RunReviewDropdown";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  h.latest.current = [];
  h.runMutate.mockResolvedValue({ runs: [] });
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, multiAgent: multiAgentMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function openPicker() {
  fireEvent.click(screen.getByText("Run Review"));
  fireEvent.click(screen.getByText(multiAgentMessages.picker.open));
}

describe("RunReviewDropdown", () => {
  it("renders the trigger label", () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByText("Run Review")).toBeInTheDocument();
  });

  it("single agent item still calls useRunReview with { prId, agentId } only (AC-3)", async () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    fireEvent.click(screen.getByText("Run Review"));
    fireEvent.click(screen.getByText("Security"));
    await waitFor(() => expect(h.runMutate).toHaveBeenCalledTimes(1));
    expect(h.runMutate).toHaveBeenCalledWith({ prId: "pr1", agentId: "a1" });
    expect(h.launchMutate).not.toHaveBeenCalled();
  });

  it('opening "Multi-agent review…" shows the picker with the estimates', () => {
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    expect(screen.getByText("$0.010 · 10s")).toBeInTheDocument();
  });

  it("launching with two ticked agents posts { prId, agentIds } in tick order and navigates (AC-1)", async () => {
    h.launchMutate.mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [], multi_run_id: "m9" });
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Style/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/multi-agent/m9"));
    expect(h.launchMutate).toHaveBeenCalledWith({ prId: "pr1", agentIds: ["a3", "a1"] });
  });

  it("a validation_error keeps the modal open, shows the invalid-agents copy and keeps the ticks (AC-2, EC-2)", async () => {
    h.launchMutate.mockRejectedValue(new ApiError("server text", 422, "validation_error"));
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Style/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByText(multiAgentMessages.error.invalidAgents)).toBeInTheDocument();
    expect(screen.queryByText("server text")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Style/ })).toHaveAttribute("aria-checked", "true");
    expect(h.push).not.toHaveBeenCalled();
  });

  it("shows a generic copy for any other launch error", async () => {
    h.launchMutate.mockRejectedValue(new ApiError("boom", 500, "internal"));
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    openPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: /Style/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Security/ }));
    fireEvent.click(screen.getByRole("button", { name: "Run multi-agent review (2)" }));
    expect(await screen.findByText(multiAgentMessages.error.launch)).toBeInTheDocument();
  });

  it("a link to the latest multi run is shown when useMultiRuns returns one; absent when empty (NFR-3, EC-16)", () => {
    const { unmount } = renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.queryByRole("link", { name: multiAgentMessages.link.latest })).not.toBeInTheDocument();
    unmount();
    h.latest.current = [{ id: "m7" }];
    renderWithIntl(<RunReviewDropdown prId="pr1" />);
    expect(screen.getByRole("link", { name: multiAgentMessages.link.latest })).toHaveAttribute(
      "href",
      "/multi-agent/m7",
    );
  });
});
