import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextAttachments, ProjectContextList } from "@devdigest/shared";
import messages from "../../../../messages/en/context.json";
import { ToastProvider } from "../../../lib/toast";

const state = {
  repoId: "r1" as string | null,
  list: {
    data: undefined as ProjectContextList | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  attachments: {
    data: undefined as ProjectContextAttachments | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  doc: {
    data: undefined as { path: string; content: string } | undefined,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
};
const mutate = vi.fn();
const useContextDocument = vi.fn();
const useContextAttachments = vi.fn();
const useSetContextAttachments = vi.fn();

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: state.repoId }),
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocuments: () => state.list,
  useContextDocument: (...a: unknown[]) => {
    useContextDocument(...a);
    return state.doc;
  },
  useContextAttachments: (...a: unknown[]) => {
    useContextAttachments(...a);
    return state.attachments;
  },
  useSetContextAttachments: (...a: unknown[]) => {
    useSetContextAttachments(...a);
    return { mutate, isPending: false };
  },
}));

import { AttachmentsEditor } from "./AttachmentsEditor";

const docs = (paths: string[]): ProjectContextList => ({
  has_clone: true,
  truncated: false,
  documents: paths.map((path) => ({ path, tag: "docs", tokens: 5, too_large: false, used_by: 0 })),
});
const attachments = (attached: string[]): ProjectContextAttachments => ({
  repo_id: "r1",
  attached,
  effective: attached.map((path) => ({ path, tokens: 5, skip_reason: null, skill: null })),
});

beforeEach(() => {
  state.repoId = "r1";
  state.list = { data: docs(["docs/a.md", "docs/b.md", "docs/c.md"]), isLoading: false, isError: false, refetch: vi.fn() };
  state.attachments = { data: attachments(["docs/a.md", "docs/b.md"]), isLoading: false, isError: false, refetch: vi.fn() };
  state.doc = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  mutate.mockReset();
  useContextDocument.mockReset();
  useContextAttachments.mockReset();
  useSetContextAttachments.mockReset();
});
afterEach(cleanup);

function renderEditor(owner: "agent" | "skill" = "agent") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ToastProvider>
        <AttachmentsEditor owner={owner} ownerId="o1" />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}
const attachLabel = (p: string) => messages.picker.attach.replace("{path}", p);

describe("AttachmentsEditor", () => {
  it("calls the hooks with the owner kind, id and the active repository", () => {
    renderEditor("skill");
    expect(useContextAttachments).toHaveBeenCalledWith("skill", "o1", "r1");
    expect(useSetContextAttachments).toHaveBeenCalledWith("skill", "o1", "r1");
  });

  it("ticking appends the path at the end and sends the whole list", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/c.md") }));
    expect(mutate.mock.calls[0]?.[0]).toEqual(["docs/a.md", "docs/b.md", "docs/c.md"]);
  });

  it("unticking removes the path", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/a.md") }));
    expect(mutate.mock.calls[0]?.[0]).toEqual(["docs/b.md"]);
  });

  it("moving down swaps two neighbours", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: messages.picker.moveDown.replace("{path}", "docs/a.md") }));
    expect(mutate.mock.calls[0]?.[0]).toEqual(["docs/b.md", "docs/a.md"]);
  });

  it("does not write for a move past the end", () => {
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: messages.picker.moveUp.replace("{path}", "docs/a.md") }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it("has no save button", () => {
    renderEditor();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  it("restores the previous list and shows the error when the write fails", () => {
    mutate.mockImplementation((_paths: string[], opts: { onError: () => void }) => opts.onError());
    renderEditor();
    fireEvent.click(screen.getByRole("checkbox", { name: attachLabel("docs/c.md") }));
    expect(screen.getByText(messages.errors.save)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: attachLabel("docs/c.md") })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: attachLabel("docs/a.md") })).toBeChecked();
  });

  it("selecting a path enables the preview query and shows its content", () => {
    state.doc = { ...state.doc, data: { path: "docs/b.md", content: "# Hello b" } };
    renderEditor();
    expect(useContextDocument).toHaveBeenLastCalledWith("r1", null);
    fireEvent.click(screen.getByText("docs/b.md"));
    expect(useContextDocument).toHaveBeenLastCalledWith("r1", "docs/b.md");
    expect(screen.getByRole("heading", { name: "Hello b" })).toBeInTheDocument();
  });

  it("a 413 answer shows the too-large text", () => {
    state.doc = { ...state.doc, isError: true, error: { status: 413 } };
    renderEditor();
    fireEvent.click(screen.getByText("docs/b.md"));
    expect(screen.getByText(messages.preview.tooLarge)).toBeInTheDocument();
  });

  describe("states", () => {
    it("no active repository shows the no-clone notice", () => {
      state.repoId = null;
      renderEditor();
      expect(screen.getByText(messages.noClone.title)).toBeInTheDocument();
    });

    it("has_clone false shows the no-clone notice", () => {
      state.list = { ...state.list, data: { has_clone: false, documents: [], truncated: false } };
      renderEditor();
      expect(screen.getByText(messages.noClone.title)).toBeInTheDocument();
    });

    it("loading shows a skeleton and no list", () => {
      state.list = { ...state.list, data: undefined, isLoading: true };
      renderEditor();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
      expect(screen.queryByText(messages.noClone.title)).not.toBeInTheDocument();
    });

    it("AC-33: loading renders the skeleton placeholder", () => {
      state.list = { ...state.list, data: undefined, isLoading: true };
      const { container } = renderEditor();
      expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
    });

    it("AC-33: once loaded the skeleton placeholder is gone", () => {
      const { container } = renderEditor();
      expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
    });

    it("a load error shows its copy and a retry", () => {
      state.list = { ...state.list, data: undefined, isError: true };
      renderEditor();
      expect(screen.getByText(messages.loadErrorTitle)).toBeInTheDocument();
      expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
      expect(screen.getByText(messages.loadError)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(state.list.refetch).toHaveBeenCalled();
    });

    it("an attachments load error shows the same titled error and retries it", () => {
      state.attachments = { ...state.attachments, data: undefined, isError: true };
      renderEditor();
      expect(screen.getByText(messages.loadErrorTitle)).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
      expect(state.attachments.refetch).toHaveBeenCalled();
    });

    it("zero documents and nothing attached shows the empty state", () => {
      state.list = { ...state.list, data: docs([]) };
      state.attachments = { ...state.attachments, data: attachments([]) };
      renderEditor();
      expect(screen.getByText(messages.empty.title)).toBeInTheDocument();
    });
  });
});
