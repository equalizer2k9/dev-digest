import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalCompare, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../messages/en/eval.json";

const refetch = vi.fn();
const compareCall = vi.fn();
const state: { data?: EvalCompare; isLoading: boolean; isError: boolean } = { isLoading: false, isError: false };

vi.mock("@/lib/hooks/evals", () => ({
  useEvalCompare: (a: string | null, b: string | null) => {
    compareCall(a, b);
    return { data: state.data, isLoading: state.isLoading, isError: state.isError, refetch };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children, crumb }: { children: React.ReactNode; crumb: { label: string }[] }) => (
    <div>
      <nav>{crumb.map((c) => c.label).join(" > ")}</nav>
      {children}
    </div>
  ),
}));

import { EvalCompareView } from "./EvalCompareView";

afterEach(cleanup);
beforeEach(() => {
  refetch.mockReset();
  compareCall.mockReset();
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
});

const run = (id: string, extra: Partial<EvalRunRecord> = {}): EvalRunRecord => ({
  id,
  agent_id: "a1",
  agent_name: "Sec",
  agent_version: 1,
  provider: "openai",
  model: "gpt-4.1",
  skills: [],
  status: "completed",
  has_errors: false,
  error: null,
  started_at: "2026-05-01T10:00:00.000Z",
  finished_at: "2026-05-01T10:01:00.000Z",
  recall: 0.5,
  precision: 0.5,
  citation_accuracy: 0.5,
  passed: 4,
  total: 8,
  cost_usd: 0.1,
  ...extra,
});

const ref = { case_id: "c1", name: "stripe-key", type: "must_find" as const, file: "src/a.ts", start_line: 3, end_line: 5 };

const compare = (extra: Partial<EvalCompare> = {}): EvalCompare => ({
  agent_id: "a1",
  agent_name: "Sec",
  earlier: run("r1", { agent_version: 1, model: "gpt-4.1", skills: [{ name: "sql", version: 1 }] }),
  later: run("r2", { agent_version: 2, model: "gpt-5", has_errors: true, skills: [{ name: "xss", version: 2 }] }),
  delta: { recall: 0.12, precision: -0.05, citation_accuracy: null, cost_usd: null },
  changed: [{ ...ref, earlier: "failed", later: "passed" }],
  added: [{ ...ref, case_id: "c2", name: "added-case" }],
  removed: [{ ...ref, case_id: "c3", name: "removed-case" }],
  prompt: {
    status: "changed",
    unavailable_versions: [],
    lines: [
      { op: "context", text: "keep" },
      { op: "remove", text: "old line" },
      { op: "add", text: "new line" },
    ],
  },
  skills: { only_earlier: [{ name: "sql", version: 1 }], only_later: [{ name: "xss", version: 2 }], reordered: false },
  ...extra,
});

function renderView(a: string | null = "r1", b: string | null = "r2") {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalCompareView a={a} b={b} />
    </NextIntlClientProvider>,
  );
}

describe("EvalCompareView", () => {
  it("calls the hook with the ids it was given (reload keeps them)", () => {
    state.data = compare();
    renderView("r1", "r2");
    expect(compareCall).toHaveBeenCalledWith("r1", "r2");
  });

  it("shows the deltas in pp, n/a when unknown, and an unknown cost as n/a", () => {
    state.data = compare();
    renderView();
    expect(screen.getByText("+12 pp")).toBeInTheDocument();
    expect(screen.getByText("−5 pp")).toBeInTheDocument();
    expect(screen.getAllByText("n/a")).toHaveLength(2); // citation + cost
  });

  it("formats a known cost delta as signed USD", () => {
    state.data = compare({ delta: { recall: 0, precision: 0, citation_accuracy: 0, cost_usd: 0.012 } });
    renderView();
    expect(screen.getByText("+$0.012")).toBeInTheDocument();
    expect(screen.getAllByText("0 pp")).toHaveLength(3);
  });

  it("renders a run header per side with version, model, skills and the errors mark", () => {
    state.data = compare();
    renderView();
    const earlier = screen.getByRole("region", { name: evalMessages.compare.earlier });
    const later = screen.getByRole("region", { name: evalMessages.compare.later });
    expect(within(earlier).getByText("gpt-4.1")).toBeInTheDocument();
    expect(within(earlier).getByText("v1")).toBeInTheDocument();
    expect(within(later).getByText("gpt-5")).toBeInTheDocument();
    expect(within(later).getByText("v2")).toBeInTheDocument();
    expect(within(later).getByText("xss v2")).toBeInTheDocument();
    expect(within(later).getByRole("img", { name: evalMessages.hasErrors })).toBeInTheDocument();
    expect(within(earlier).queryByRole("img", { name: evalMessages.hasErrors })).not.toBeInTheDocument();
  });

  it("lists the changed case with name, type, location and both statuses; added and removed sections", () => {
    state.data = compare();
    renderView();
    const changed = screen.getByRole("region", { name: evalMessages.compare.changedCases });
    expect(within(changed).getByText("stripe-key")).toBeInTheDocument();
    expect(within(changed).getByText(evalMessages.type.mustFind)).toBeInTheDocument();
    expect(within(changed).getByText("src/a.ts:3-5")).toBeInTheDocument();
    expect(within(changed).getByText("Failed → Passed")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: evalMessages.compare.addedCases })).getByText("added-case")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: evalMessages.compare.removedCases })).getByText("removed-case")).toBeInTheDocument();
  });

  it("says nothing changed when all three lists are empty", () => {
    state.data = compare({ changed: [], added: [], removed: [] });
    renderView();
    expect(screen.getByText(evalMessages.compare.noChanges)).toBeInTheDocument();
  });

  it("renders a changed prompt as marked lines", () => {
    state.data = compare();
    const { container } = renderView();
    const pre = container.querySelector("pre")!;
    expect(pre.textContent).toBe(" keep\n−old line\n+new line");
  });

  it("renders the unchanged text", () => {
    state.data = compare({ prompt: { status: "unchanged", unavailable_versions: [], lines: [] } });
    const { container } = renderView();
    expect(screen.getByText(evalMessages.compare.promptUnchanged)).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeNull();
  });

  it("renders the unavailable text naming the version", () => {
    state.data = compare({ prompt: { status: "unavailable", unavailable_versions: [1, 3], lines: [] } });
    renderView();
    expect(screen.getByText("The prompt text is unavailable for versions 1, 3.")).toBeInTheDocument();
  });

  it("renders prompt HTML as inert text", () => {
    state.data = compare({
      prompt: { status: "changed", unavailable_versions: [], lines: [{ op: "add", text: "<script>alert(1)</script>" }] },
    });
    const { container } = renderView();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("pre")!.textContent).toContain("<script>alert(1)</script>");
  });

  it("lists the only-earlier and only-later skills", () => {
    state.data = compare();
    renderView();
    const diff = screen.getByRole("region", { name: evalMessages.compare.skillsTitle });
    expect(within(diff).getByText("sql v1")).toBeInTheDocument();
    expect(within(diff).getByText("xss v2")).toBeInTheDocument();
  });

  it("shows loading", () => {
    state.isLoading = true;
    renderView();
    expect(screen.getByText(evalMessages.dashboard.loading)).toBeInTheDocument();
  });

  it("shows an error with a retry that refetches", () => {
    state.isError = true;
    renderView();
    expect(screen.getByText(evalMessages.compare.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the error copy when a or b is missing", () => {
    renderView("r1", null);
    expect(screen.getByText(evalMessages.compare.missingIds)).toBeInTheDocument();
    expect(compareCall).toHaveBeenCalledWith("r1", null);
  });

  it("puts the agent name in the last crumb", () => {
    state.data = compare();
    renderView();
    expect(screen.getByRole("navigation")).toHaveTextContent("Skills Lab > Eval Dashboard > Sec");
  });
});
