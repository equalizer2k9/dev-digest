import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentSkillLink, SkillWithUsage } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "../../../../../../../lib/toast";

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

const SKILLS: SkillWithUsage[] = [
  {
    id: "sk1", name: "alpha-rubric", description: "", type: "rubric", source: "manual",
    body: "a", enabled: true, version: 1, agent_count: 1,
  },
  {
    id: "sk2", name: "beta-security", description: "", type: "security", source: "imported_file",
    body: "b", enabled: true, version: 1, agent_count: 1,
  },
  {
    id: "sk3", name: "gamma-custom", description: "", type: "custom", source: "manual",
    body: "c", enabled: true, version: 1, agent_count: 0,
  },
];

// sk1 then sk2 are linked; sk3 is not linked to this agent.
const LINKS: AgentSkillLink[] = [
  { agent_id: "ag1", skill_id: "sk1", order: 0 },
  { agent_id: "ag1", skill_id: "sk2", order: 1 },
];

const setMutate = vi.fn();

vi.mock("../../../../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentSkills: () => ({ data: LINKS }),
  useSetAgentSkills: () => ({ mutate: setMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(() => {
  cleanup();
  setMutate.mockReset();
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>
        <SkillsTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

/** The ordered id list the component posted on its Nth write. */
function postedIds(call = 0): string[] {
  return setMutate.mock.calls[call]![0] as string[];
}

describe("SkillsTab", () => {
  it("lists every skill in the system, not only the linked ones", () => {
    renderTab();
    expect(screen.getByTestId("skill-row-sk1")).toBeInTheDocument();
    expect(screen.getByTestId("skill-row-sk2")).toBeInTheDocument();
    expect(screen.getByTestId("skill-row-sk3")).toBeInTheDocument();
    // Each row carries a type label and an enabled toggle.
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("security")).toBeInTheDocument();
    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(3);
  });

  it("states that the order is prompt order", () => {
    renderTab();
    expect(screen.getByText(/earlier skills appear earlier in the assembled prompt/)).toBeInTheDocument();
  });

  it("filters rows by name without losing the ordering of what remains", () => {
    renderTab();
    const search = screen.getByLabelText("Search skills by name…");

    fireEvent.change(search, { target: { value: "security" } });
    expect(screen.getByTestId("skill-row-sk2")).toBeInTheDocument();
    expect(screen.queryByTestId("skill-row-sk1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("skill-row-sk3")).not.toBeInTheDocument();

    // A broader term brings everything back, still in prompt order first.
    fireEvent.change(search, { target: { value: "a" } });
    expect(screen.getAllByTestId(/^skill-row-/).map((r) => r.getAttribute("data-testid"))).toEqual([
      "skill-row-sk1",
      "skill-row-sk2",
      "skill-row-sk3",
    ]);
  });

  it("attaching a skill posts the full ordered id list with it appended", () => {
    renderTab();
    fireEvent.click(screen.getByTestId("skill-row-sk3").querySelector('[role="switch"]')!);
    expect(setMutate).toHaveBeenCalledTimes(1);
    expect(postedIds()).toEqual(["sk1", "sk2", "sk3"]);
  });

  it("detaching a skill posts the remaining ordered id list", () => {
    renderTab();
    fireEvent.click(screen.getByTestId("skill-row-sk1").querySelector('[role="switch"]')!);
    expect(postedIds()).toEqual(["sk2"]);
  });

  it("only enabled rows are draggable and have a handle", () => {
    renderTab();
    expect(screen.getByTestId("skill-row-sk1")).toHaveAttribute("draggable", "true");
    expect(screen.getByTestId("skill-row-sk3")).toHaveAttribute("draggable", "false");
    expect(screen.getByTestId("drag-handle-sk1")).toBeInTheDocument();
    expect(screen.queryByTestId("drag-handle-sk3")).not.toBeInTheDocument();
    // …and a disabled row has no move buttons either.
    expect(screen.queryByLabelText("Move gamma-custom up")).not.toBeInTheDocument();
  });

  it("the move-up button reorders and posts the new order", () => {
    renderTab();
    fireEvent.click(screen.getByLabelText("Move beta-security up"));
    expect(postedIds()).toEqual(["sk2", "sk1"]);
    // The list is reordered optimistically, before the server answers.
    const rows = screen.getAllByTestId(/^skill-row-/).map((r) => r.getAttribute("data-testid"));
    expect(rows.slice(0, 2)).toEqual(["skill-row-sk2", "skill-row-sk1"]);
  });

  it("dropping a row on another writes the dragged order", () => {
    renderTab();
    const from = screen.getByTestId("skill-row-sk2");
    const to = screen.getByTestId("skill-row-sk1");
    fireEvent.dragStart(from);
    fireEvent.dragOver(to);
    fireEvent.drop(to);
    expect(postedIds()).toEqual(["sk2", "sk1"]);
  });

  it("rolls the order back and raises a toast when the write fails", () => {
    setMutate.mockImplementation((_ids: string[], opts?: { onError?: () => void }) => opts?.onError?.());
    renderTab();
    fireEvent.click(screen.getByLabelText("Move beta-security up"));
    expect(screen.getByText("Could not save the new skill order.")).toBeInTheDocument();
    const rows = screen.getAllByTestId(/^skill-row-/).map((r) => r.getAttribute("data-testid"));
    expect(rows.slice(0, 2)).toEqual(["skill-row-sk1", "skill-row-sk2"]);
  });
});
