import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillWithUsage } from "@devdigest/shared";
import messages from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: SkillWithUsage = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Flags happy-path-only tests",
  type: "rubric",
  source: "manual",
  body: "# Rule\nEvery branch needs a test.",
  enabled: true,
  version: 3,
  agent_count: 2,
};

function renderCard(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("SkillCard", () => {
  it("renders name, type, description, version and the agent count", () => {
    renderCard(<SkillCard skill={SKILL} />);
    expect(screen.getByText("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByText("rubric")).toBeInTheDocument();
    expect(screen.getByText("Flags happy-path-only tests")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("labels an imported skill Imported, not Manual", () => {
    renderCard(<SkillCard skill={{ ...SKILL, source: "imported_file" }} />);
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
  });

  it("toggling does not also trigger the card's own click", () => {
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    renderCard(<SkillCard skill={SKILL} onOpen={onOpen} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("the trash button opens the confirm dialog instead of deleting, and does not open the card", () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    renderCard(<SkillCard skill={SKILL} onOpen={onOpen} onDelete={onDelete} />);

    fireEvent.click(screen.getByLabelText("Delete skill"));
    expect(onOpen).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete “test-quality-rubric”\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("cancelling the dialog leaves the skill in place", () => {
    const onDelete = vi.fn();
    renderCard(<SkillCard skill={SKILL} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText("Delete skill"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText(/This cannot be undone/)).not.toBeInTheDocument();
  });

  it("opens the preview when the card body is clicked", () => {
    const onOpen = vi.fn();
    renderCard(<SkillCard skill={SKILL} onOpen={onOpen} />);
    fireEvent.click(screen.getByText("test-quality-rubric"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
