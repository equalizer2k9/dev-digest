import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillVersion } from "@devdigest/shared";
import messages from "../../../../../../messages/en/skills.json";
import { ToastProvider } from "../../../../../lib/toast";

const SKILL: Skill = {
  id: "sk1",
  name: "test-quality-rubric",
  description: "Flags happy-path-only tests",
  type: "rubric",
  source: "manual",
  body: "# Heading\n\n- one\n- two\n\n```ts\nconst a = 1;\n```",
  enabled: true,
  version: 3,
};

const VERSIONS: SkillVersion[] = [
  { skill_id: "sk1", version: 3, body: SKILL.body, created_at: "2026-09-20T10:00:00Z" },
  { skill_id: "sk1", version: 2, body: "# Heading\n\n- one", created_at: "2026-09-19T10:00:00Z" },
  { skill_id: "sk1", version: 1, body: "# Old", created_at: "2026-09-18T10:00:00Z" },
];

const restoreMutate = vi.fn();
const deleteMutate = vi.fn();

vi.mock("../../../../../lib/hooks/skills", () => ({
  useSkill: () => ({ data: SKILL, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: VERSIONS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillVersion: (_id: string, v: number) => ({
    data: VERSIONS.find((x) => x.version === v),
    isLoading: false,
  }),
  useUpdateSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { SkillDetailView } from "./SkillDetailView";

afterEach(() => {
  cleanup();
  restoreMutate.mockReset();
  deleteMutate.mockReset();
});

function renderView(tab: string, onTab = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <SkillDetailView id="sk1" tab={tab} onTab={onTab} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  return { onTab };
}

describe("SkillDetailView", () => {
  it("offers exactly the three tabs Config, Preview and Versioning", () => {
    renderView("config");
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("Versioning")).toBeInTheDocument();
    expect(screen.queryByText("Evals")).not.toBeInTheDocument();
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
  });

  it("Config edits name, description, type, body and enabled", () => {
    renderView("config");
    expect(screen.getByDisplayValue("test-quality-rubric")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Flags happy-path-only tests")).toBeInTheDocument();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("rubric");
    expect(screen.getByDisplayValue(/# Heading/)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("Preview renders the body as elements, not raw markdown", () => {
    renderView("preview");
    const preview = screen.getByTestId("skill-preview");
    expect(preview.querySelector("h1")?.textContent).toBe("Heading");
    expect(preview.querySelectorAll("li")).toHaveLength(2);
    expect(preview.querySelector("code")).not.toBeNull();
    // The whole markdown source is never dumped verbatim.
    expect(preview.textContent).not.toContain("```");
  });

  it("Versioning lists every version and badges the current one without buttons", () => {
    renderView("versioning");
    expect(screen.getByTestId("version-row-3")).toBeInTheDocument();
    expect(screen.getByTestId("version-row-2")).toBeInTheDocument();
    expect(screen.getByTestId("version-row-1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByTestId("version-row-3").querySelectorAll("button")).toHaveLength(0);
    // Two older rows × (Diff + Restore)
    expect(screen.getAllByText("Diff")).toHaveLength(2);
    expect(screen.getAllByText("Restore")).toHaveLength(2);
  });

  it("Diff shows added and removed lines against the current body", async () => {
    renderView("versioning");
    // v2 lacks the "- two" bullet and the fenced block that v3 (current) has.
    fireEvent.click(screen.getByTestId("version-row-2").querySelector("button")!);

    const diff = await screen.findByTestId("version-diff");
    const added = [...diff.querySelectorAll('[data-diff-op="add"]')].map((e) => e.textContent);
    expect(added.some((l) => l?.includes("- two"))).toBe(true);
    expect(diff.querySelector('[data-diff-op="context"]')).not.toBeNull();
  });

  it("Restore confirms before writing", () => {
    renderView("versioning");
    const restoreBtn = screen.getAllByText("Restore")[1]!;
    fireEvent.click(restoreBtn);
    expect(restoreMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Restore v1\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Restore this version"));
    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0]![0]).toEqual({ id: "sk1", version: 1 });
  });

  it("deleting from Config goes through the confirm dialog", async () => {
    renderView("config");
    fireEvent.click(screen.getByText("Delete skill", { selector: "button" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete “test-quality-rubric”\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledTimes(1));
  });
});
