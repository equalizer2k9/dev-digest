import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillWithUsage } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";

const SKILLS: SkillWithUsage[] = [
  {
    id: "sk1",
    name: "test-quality-rubric",
    description: "Flags happy-path-only tests",
    type: "rubric",
    source: "manual",
    body: "# Rule\nEvery branch needs a test.",
    enabled: true,
    version: 2,
    agent_count: 1,
  },
  {
    id: "sk2",
    name: "api-contract-guard",
    description: "Breaking request/response changes",
    type: "security",
    source: "imported_file",
    body: "## Contract\nNever drop a field.",
    enabled: false,
    version: 1,
    agent_count: 0,
  },
];

const updateMutate = vi.fn();
const deleteMutate = vi.fn();

// The view never fetches directly — stub its hooks so no query client is needed.
vi.mock("../../../../lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useCreateSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkillPreview: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useImportSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

// AppShell pulls in the router, repo context and global shortcuts — out of scope here.
vi.mock("../../../../components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { SkillsGridView } from "./SkillsGridView";

afterEach(cleanup);

function renderGrid() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <SkillsGridView />
    </NextIntlClientProvider>,
  );
}

describe("SkillsGridView", () => {
  it("renders a card per skill", () => {
    renderGrid();
    expect(screen.getByText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
  });

  it("opens the preview in a side panel and keeps the grid mounted behind it", () => {
    renderGrid();
    fireEvent.click(screen.getByText("test-quality-rubric"));

    // The drawer is open …
    expect(screen.getByText("Open →")).toBeInTheDocument();
    expect(screen.getByText("Every branch needs a test.")).toBeInTheDocument();
    // … and the other card is still on screen — it is a panel, not a navigation.
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("the preview's Open link navigates to the skill page", () => {
    renderGrid();
    fireEvent.click(screen.getByText("test-quality-rubric"));
    fireEvent.click(screen.getByText("Open →"));
    expect(push).toHaveBeenCalledWith("/skills/sk1?tab=config");
  });

  it("filters the grid by the search box", () => {
    renderGrid();
    fireEvent.change(screen.getByLabelText("Search skills…"), { target: { value: "contract" } });
    expect(screen.getByText("api-contract-guard")).toBeInTheDocument();
    expect(screen.queryByText("test-quality-rubric")).not.toBeInTheDocument();
  });

  it("the Add Skill menu offers create and import", () => {
    renderGrid();
    fireEvent.click(screen.getByText("Add Skill"));
    expect(screen.getByText("Create from scratch")).toBeInTheDocument();
    expect(screen.getByText("Import from file")).toBeInTheDocument();
  });

  it("choosing Create from scratch opens the creation modal", () => {
    renderGrid();
    fireEvent.click(screen.getByText("Add Skill"));
    fireEvent.click(screen.getByText("Create from scratch"));
    // Title and the submit button share the label, so assert on both fields.
    expect(screen.getAllByText("Create skill")).toHaveLength(2);
    expect(screen.getByPlaceholderText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("What this skill makes the reviewer look for")).toBeInTheDocument();
  });

  it("the card toggle writes enabled through the update hook", () => {
    renderGrid();
    // First card is enabled → toggling it asks for false.
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    expect(updateMutate).toHaveBeenCalledWith({ id: "sk1", patch: { enabled: false } });
  });
});
