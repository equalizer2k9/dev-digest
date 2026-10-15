import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ProjectContextList } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

const state = {
  list: { data: undefined as ProjectContextList | undefined, isLoading: false, isError: false, refetch: vi.fn() },
  doc: { data: undefined as { path: string; content: string } | undefined, isLoading: false, isError: false, error: null as unknown, refetch: vi.fn() },
  notFound: false,
};
const useContextDocument = vi.fn();

vi.mock("next/navigation", () => ({ useParams: () => ({ repoId: "r1" }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/repo-not-found", () => ({ RepoNotFound: () => <div>repo-not-found</div> }));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ activeRepo: { id: "r1", name: "payments-api" } }),
  useRepoNotFound: () => state.notFound,
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocuments: () => state.list,
  useContextDocument: (...a: unknown[]) => {
    useContextDocument(...a);
    return state.doc;
  },
}));

import { ProjectContextView } from "./ProjectContextView";

const FIXTURE: ProjectContextList = {
  has_clone: true,
  truncated: false,
  documents: [
    { path: "docs/architecture.md", tag: "docs", tokens: 1000, too_large: false, used_by: 2 },
    { path: "docs/sub/rules.md", tag: "docs", tokens: 234, too_large: false, used_by: 0 },
    { path: "specs/huge.md", tag: "specs", tokens: null, too_large: true, used_by: 1 },
  ],
};

beforeEach(() => {
  state.list = { data: FIXTURE, isLoading: false, isError: false, refetch: vi.fn() };
  state.doc = { data: undefined, isLoading: false, isError: false, error: null, refetch: vi.fn() };
  state.notFound = false;
  useContextDocument.mockReset();
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView />
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextView", () => {
  it("renders folders and documents as a tree with tag and used-by", () => {
    renderView();
    // "docs" is both a folder name and a tag: 1 folder + 2 tag badges.
    expect(screen.getAllByText("docs")).toHaveLength(3);
    expect(screen.getByText("sub")).toBeInTheDocument();
    expect(screen.getByText("architecture.md")).toBeInTheDocument();
    expect(screen.getByText("rules.md")).toBeInTheDocument();
    expect(screen.getAllByText(messages.tag.specs)).toHaveLength(2); // folder + badge
    expect(screen.getByText("Used by 2 agents")).toBeInTheDocument();
    expect(screen.getByText("Used by 1 agent")).toBeInTheDocument();
  });

  it("clicking a document shows its rendered content on the same page", () => {
    state.doc = { ...state.doc, data: { path: "docs/architecture.md", content: "# Layers" } };
    renderView();
    expect(useContextDocument).toHaveBeenLastCalledWith("r1", null);
    fireEvent.click(screen.getByText("architecture.md"));
    expect(useContextDocument).toHaveBeenLastCalledWith("r1", "docs/architecture.md");
    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
  });

  it("the footer reads files and tokens; a too-large document is marked, not counted", () => {
    renderView();
    expect(screen.getByText("3 files · 1,234 tokens")).toBeInTheDocument();
    expect(screen.getByText(messages.picker.tooLarge)).toBeInTheDocument();
    fireEvent.click(screen.getByText("huge.md"));
    expect(useContextDocument).toHaveBeenLastCalledWith("r1", null);
    expect(screen.getByText(messages.preview.tooLarge)).toBeInTheDocument();
  });

  it("loading shows no tree and no error", () => {
    state.list = { ...state.list, data: undefined, isLoading: true };
    renderView();
    expect(screen.queryByText("architecture.md")).not.toBeInTheDocument();
    expect(screen.queryByText(messages.loadError)).not.toBeInTheDocument();
  });

  it("AC-33: loading renders the skeleton placeholder rows", () => {
    state.list = { ...state.list, data: undefined, isLoading: true };
    const { container } = renderView();
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("AC-33: once loaded the skeleton placeholder is gone", () => {
    const { container } = renderView();
    expect(container.querySelectorAll(".skeleton")).toHaveLength(0);
  });

  it("a load error shows its copy and a retry that calls refetch", () => {
    state.list = { ...state.list, data: undefined, isError: true };
    renderView();
    expect(screen.getByText(messages.loadErrorTitle)).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByText(messages.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.list.refetch).toHaveBeenCalled();
  });

  it("zero documents shows the empty state naming the three folders", () => {
    state.list = { ...state.list, data: { has_clone: true, documents: [], truncated: false } };
    renderView();
    expect(screen.getByText(messages.empty.title)).toBeInTheDocument();
    expect(screen.getByText(/specs\/, docs\/ or insights\//)).toBeInTheDocument();
  });

  it("has_clone false shows the no-clone notice", () => {
    state.list = { ...state.list, data: { has_clone: false, documents: [], truncated: false } };
    renderView();
    expect(screen.getByText(messages.noClone.title)).toBeInTheDocument();
  });

  it("truncated shows the cut notice", () => {
    state.list = { ...state.list, data: { ...FIXTURE, truncated: true } };
    renderView();
    expect(screen.getByText(messages.truncated)).toBeInTheDocument();
  });

  it("offers no Save, Edit, Delete, Upload or Re-index control", () => {
    renderView();
    expect(screen.queryByRole("button", { name: /save|edit|delete|upload|re-?index/i })).not.toBeInTheDocument();
  });

  it("shows the title from the message file", () => {
    renderView();
    expect(screen.getByRole("heading", { name: new RegExp(messages.title) })).toBeInTheDocument();
  });
});
