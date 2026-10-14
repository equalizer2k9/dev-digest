import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../messages/en/skills.json";
import { ApiError } from "../../../../../../lib/api";

const createMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutateAsync: createMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

afterEach(() => {
  cleanup();
  createMutate.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <CreateSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

/** The footer button — the modal title carries the same label. */
function createButton() {
  return screen.getAllByText("Create skill")[1]!;
}

function fillRequired() {
  fireEvent.change(screen.getByPlaceholderText("test-quality-rubric"), {
    target: { value: "new-rubric" },
  });
  fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), {
    target: { value: "# Rule" },
  });
}

describe("CreateSkillModal", () => {
  it("offers exactly name, description, type and a markdown body", () => {
    renderModal();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
    expect(screen.getByText("Skill body (Markdown)")).toBeInTheDocument();
    // The four contract types, no more.
    expect(screen.getAllByRole("option").map((o) => (o as HTMLOptionElement).value)).toEqual([
      "rubric",
      "convention",
      "security",
      "custom",
    ]);
  });

  it("refuses to submit without a name and a body", async () => {
    renderModal();
    fireEvent.click(createButton());
    expect(await screen.findByText("Name and body are both required.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("creates the skill and closes", async () => {
    createMutate.mockResolvedValue({ id: "sk9" });
    const { onClose } = renderModal();
    fillRequired();
    fireEvent.click(createButton());

    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith({
      name: "new-rubric",
      description: "",
      type: "custom",
      body: "# Rule",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("renders a server rejection inline", async () => {
    createMutate.mockRejectedValue(new ApiError("name already taken", 409));
    renderModal();
    fillRequired();
    fireEvent.click(createButton());
    expect(await screen.findByText("name already taken")).toBeInTheDocument();
  });
});
