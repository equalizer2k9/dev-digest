import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ApiError } from "../../../../../../lib/api";

const previewMutate = vi.fn();
const saveMutate = vi.fn();

vi.mock("../../../../../../lib/hooks/skills", () => ({
  useImportSkillPreview: () => ({ mutateAsync: previewMutate, isPending: false }),
  useImportSkill: () => ({ mutateAsync: saveMutate, isPending: false }),
}));

import { ImportSkillModal } from "./ImportSkillModal";

const PREVIEW: SkillImportPreview = {
  name: "imported-rubric",
  description: "From a zip",
  type: "rubric",
  body: "# Heading\n\n- one\n- two",
  source: "imported_file",
  warnings: ["Archive held 2 markdown files; picked SKILL.md"],
};

afterEach(() => {
  cleanup();
  previewMutate.mockReset();
  saveMutate.mockReset();
});

function renderModal(onClose = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ImportSkillModal onClose={onClose} />
    </NextIntlClientProvider>,
  );
  return { onClose };
}

function pick(name = "skill.zip") {
  const input = screen.getByLabelText("File") as HTMLInputElement;
  const file = new File(["body"], name, { type: "application/zip" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("ImportSkillModal", () => {
  it("accepts .md and .zip only, and saves nothing before a file is picked", () => {
    renderModal();
    expect((screen.getByLabelText("File") as HTMLInputElement).accept).toBe(".md,.zip");
    expect(screen.getByText("Choose a .md or .zip file to see its parsed core.")).toBeInTheDocument();
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it("shows the parsed core — name, description, type, rendered body — before saving", async () => {
    previewMutate.mockResolvedValue(PREVIEW);
    renderModal();
    pick();

    await waitFor(() => expect(previewMutate).toHaveBeenCalledTimes(1));
    expect(await screen.findByDisplayValue("imported-rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("From a zip")).toBeInTheDocument();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("rubric");
    // Body is RENDERED markdown, not a raw source dump.
    const rendered = screen.getByTestId("import-rendered-body");
    expect(rendered.querySelector("h1")?.textContent).toBe("Heading");
    expect(rendered.querySelectorAll("li")).toHaveLength(2);
    expect(rendered.querySelector("pre")).toBeNull();
    // Still nothing persisted.
    expect(saveMutate).not.toHaveBeenCalled();
  });

  it("posts the edited fields alongside the file", async () => {
    previewMutate.mockResolvedValue(PREVIEW);
    saveMutate.mockResolvedValue({ id: "sk7" });
    const { onClose } = renderModal();
    const file = pick();

    await screen.findByDisplayValue("imported-rubric");
    fireEvent.change(screen.getByDisplayValue("imported-rubric"), { target: { value: "corrected" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => expect(saveMutate).toHaveBeenCalledTimes(1));
    expect(saveMutate).toHaveBeenCalledWith({
      file,
      name: "corrected",
      description: "From a zip",
      type: "security",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("renders a server rejection inline rather than as a toast", async () => {
    previewMutate.mockRejectedValue(new ApiError("Upload exceeds 1 MiB", 413));
    renderModal();
    pick("huge.zip");
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload exceeds 1 MiB");
    expect(screen.queryByTestId("import-rendered-body")).not.toBeInTheDocument();
  });
});
