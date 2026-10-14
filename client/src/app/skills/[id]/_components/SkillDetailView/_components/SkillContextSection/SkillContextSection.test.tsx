import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/context.json";
import { ToastProvider } from "../../../../../../../lib/toast";

const hooks = vi.hoisted(() => ({
  useContextAttachments: vi.fn(),
  useSetContextAttachments: vi.fn(),
}));
vi.mock("@/lib/repo-context", () => ({ useActiveRepo: () => ({ repoId: "r1" }) }));
vi.mock("@/lib/hooks/project-context", () => ({
  useContextDocuments: () => ({
    data: {
      has_clone: true,
      truncated: false,
      documents: [{ path: "docs/a.md", tag: "docs", tokens: 10, too_large: false, used_by: 0 }],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useContextDocument: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useContextAttachments: (...a: unknown[]) => {
    hooks.useContextAttachments(...a);
    return {
      data: { repo_id: "r1", attached: [], effective: [] },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
  },
  useSetContextAttachments: (...a: unknown[]) => {
    hooks.useSetContextAttachments(...a);
    return { mutate: vi.fn(), isPending: false };
  },
}));

import { SkillContextSection } from "./SkillContextSection";

afterEach(cleanup);

describe("SkillContextSection", () => {
  it("shows its heading and the same list, wired to the skill", () => {
    render(
      <NextIntlClientProvider locale="en" messages={{ context: messages }}>
        <ToastProvider>
          <SkillContextSection skill={{ id: "sk1", name: "Rubric" } as Skill} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { name: messages.section.title })).toBeInTheDocument();
    expect(messages.section.title).toBe("Project context to use");
    expect(screen.getByText("docs/a.md")).toBeInTheDocument();
    expect(hooks.useContextAttachments).toHaveBeenCalledWith("skill", "sk1", "r1");
    expect(hooks.useSetContextAttachments).toHaveBeenCalledWith("skill", "sk1", "r1");
  });
});
