import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const hooks = vi.hoisted(() => ({
  useContextAttachments: vi.fn(),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocuments: () => ({
    data: {
      has_clone: true,
      truncated: false,
      documents: [
        { path: "docs/a.md", tag: "docs", tokens: 100, too_large: false, used_by: 1 },
        { path: "specs/b.md", tag: "specs", tokens: 50, too_large: false, used_by: 0 },
        { path: "docs/c.md", tag: "docs", tokens: 7, too_large: false, used_by: 0 },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextDocument: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useContextAttachments: (...a: unknown[]) => {
    hooks.useContextAttachments(...a);
    return {
      data: {
        repo_id: "r1",
        attached: ["docs/a.md"],
        effective: [
          { path: "docs/a.md", tokens: 100, skip_reason: null, skill: null },
          { path: "specs/b.md", tokens: 50, skip_reason: null, skill: { id: "s1", name: "Rubric" } },
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useSetContextAttachments: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ContextTab } from "./ContextTab";

afterEach(cleanup);

const AGENT = { id: "ag1", name: "Reviewer" } as Agent;

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ToastProvider>
        <ContextTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextTab", () => {
  it("lists the active repository's documents with checkbox, path and tag", () => {
    renderTab();
    expect(hooks.useContextAttachments).toHaveBeenCalledWith("agent", "ag1", "r1");
    expect(screen.getByRole("checkbox", { name: messages.picker.attach.replace("{path}", "docs/a.md") })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: messages.picker.attach.replace("{path}", "docs/c.md") })).not.toBeChecked();
    expect(screen.getAllByText(messages.tag.docs).length).toBeGreaterThan(0);
  });

  it("a skill-only document carries the skill name and has no control", () => {
    renderTab();
    expect(screen.getByText(messages.picker.viaSkill.replace("{name}", "Rubric"))).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: messages.picker.attach.replace("{path}", "specs/b.md") })).not.toBeInTheDocument();
  });

  it("the footer shows the summed tokens", () => {
    renderTab();
    expect(screen.getByText(messages.picker.footer.replace("{tokens, number}", "150"))).toBeInTheDocument();
  });

  it("AC-37: shows \"N of M attached\" — effective documents of the documents listed", () => {
    renderTab();
    const text = messages.counter.ofListed.replace("{attached, number}", "2").replace("{listed, number}", "3");
    expect(screen.getByTestId("doc-counter")).toHaveTextContent(text);
  });
});
