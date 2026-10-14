import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../messages/en/agents.json";
import { AgentCard } from "./AgentCard";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentCard (smoke)", () => {
  it("renders the agent name, model chip and skill count", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={3} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("3 skills")).toBeInTheDocument();
  });

  it("falls back to a translated placeholder when description is empty", () => {
    renderWithIntl(<AgentCard ag={{ ...AGENT, description: "" }} />);
    expect(screen.getByText("No description")).toBeInTheDocument();
  });

  it("shows the tile's model, toggle and skill count together", () => {
    renderWithIntl(<AgentCard ag={AGENT} skillCount={2} onToggle={() => {}} />);
    expect(screen.getByText("Security Reviewer")).toBeInTheDocument();
    expect(screen.getByText("Flags secrets and injection")).toBeInTheDocument();
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByText("2 skills")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete agent")).toBeInTheDocument();
  });

  it("deletes through the confirm dialog, never window.confirm", () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const onClick = vi.fn();
    renderWithIntl(<AgentCard ag={AGENT} onClick={onClick} />);

    fireEvent.click(screen.getByLabelText("Delete agent"));
    expect(confirmSpy).not.toHaveBeenCalled();
    // The trash does not open the editor either.
    expect(onClick).not.toHaveBeenCalled();

    // Confirm, Cancel and a close × are all present.
    expect(screen.getByText(/Delete “Security Reviewer”\?/)).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByLabelText("Close")).toBeInTheDocument();

    // Cancelling leaves the agent in place.
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText(/Delete “Security Reviewer”\?/)).not.toBeInTheDocument();
    confirmSpy.mockRestore();
  });
});
