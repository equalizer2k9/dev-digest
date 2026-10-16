import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, EvalAgentOverview, EvalCaseRow, EvalRunRecord } from "@devdigest/shared";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { ApiError } from "@/lib/api";

const runMutate = vi.fn();
const deleteMutate = vi.fn();
const runCaseAsync = vi.fn();
const updateMutate = vi.fn();
const refetch = vi.fn();
const overviewCall = vi.fn();
const state: {
  data?: EvalAgentOverview;
  isLoading: boolean;
  isError: boolean;
  runPending: boolean;
} = { isLoading: false, isError: false, runPending: false };

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

vi.mock("@/lib/hooks/evals", () => ({
  useEvalOverview: (id: string) => {
    overviewCall(id);
    return { data: state.data, isLoading: state.isLoading, isError: state.isError, refetch };
  },
  useRunEval: () => ({ mutate: runMutate, isPending: state.runPending }),
  useDeleteEvalCase: () => ({ mutate: deleteMutate, isPending: false }),
  useRunEvalCase: () => ({ mutateAsync: runCaseAsync, isPending: false }),
  useUpdateEvalCase: () => ({ mutate: updateMutate, isPending: false }),
}));

import { EvalsTab } from "./EvalsTab";

afterEach(cleanup);
beforeEach(() => {
  runMutate.mockReset();
  deleteMutate.mockReset();
  runCaseAsync.mockReset();
  updateMutate.mockReset();
  refetch.mockReset();
  push.mockReset();
  overviewCall.mockReset();
  state.data = undefined;
  state.isLoading = false;
  state.isError = false;
  state.runPending = false;
});

const AGENT = { id: "a1", name: "Sec" } as Agent;

const kase = (id: string, extra: Partial<EvalCaseRow> = {}): EvalCaseRow => ({
  id,
  name: `case-${id}`,
  agent_id: "a1",
  expectation: { type: "must_find", file: "src/config.ts", start_line: 11, end_line: 14, title: "t" },
  source_finding_id: null,
  created_at: "2026-05-01T10:00:00Z",
  latest_status: "never_run",
  ...extra,
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
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  passed: 3,
  total: 3,
  cost_usd: null,
  ...extra,
});

const overview = (cases: EvalCaseRow[], runs: EvalRunRecord[] = []): EvalAgentOverview => ({
  agent_id: "a1",
  agent_name: "Sec",
  cases,
  runs,
});

function renderTab() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalsTab agent={AGENT} />
    </NextIntlClientProvider>,
  );
}

const THREE = () => [
  kase("c1", { latest_status: "passed" }),
  kase("c2", {
    latest_status: "failed",
    expectation: { type: "must_not_flag", file: "src/b.ts", start_line: 5, end_line: 5, title: "t" },
  }),
  kase("c3"),
];

describe("EvalsTab", () => {
  it("rows show name, type, file:line and the latest status incl. never run", () => {
    state.data = overview(THREE());
    renderTab();
    expect(screen.getByText("case-c1")).toBeInTheDocument();
    expect(screen.getAllByText("src/config.ts:11-14")).toHaveLength(2);
    expect(screen.getByText("src/b.ts:5")).toBeInTheDocument();
    expect(screen.getAllByText(evalMessages.type.mustFind)).toHaveLength(2);
    expect(screen.getByText(evalMessages.type.mustNotFlag)).toBeInTheDocument();
    expect(screen.getByText(evalMessages.status.passed)).toBeInTheDocument();
    expect(screen.getByText(evalMessages.status.failed)).toBeInTheDocument();
    expect(screen.getByText(evalMessages.status.neverRun)).toBeInTheDocument();
  });

  it("Run eval (3) calls the run mutation", () => {
    state.data = overview(THREE());
    renderTab();
    const btn = screen.getByRole("button", { name: "Run eval (3)" });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(runMutate).toHaveBeenCalledTimes(1);
  });

  it("AC-13: a run refused as in progress says so and refetches the overview", () => {
    state.data = overview(THREE());
    runMutate.mockImplementation((_v, opts) =>
      opts.onError(new ApiError("A run is in progress", 409, "eval_run_in_progress")),
    );
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Run eval (3)" }));
    expect(screen.getByText(evalMessages.runInProgress)).toBeInTheDocument();
    expect(screen.queryByText(evalMessages.runFailed)).not.toBeInTheDocument();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("any other run failure shows the generic error and does not refetch", () => {
    state.data = overview(THREE());
    runMutate.mockImplementation((_v, opts) => opts.onError(new ApiError("boom", 500, "internal_error")));
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Run eval (3)" }));
    expect(screen.getByText(evalMessages.runFailed)).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
  });

  it("Run eval is disabled with zero cases", () => {
    state.data = overview([]);
    renderTab();
    expect(screen.getByRole("button", { name: "Run eval (0)" })).toBeDisabled();
  });

  it("Run eval is disabled while a run is running", () => {
    state.data = overview(THREE(), [run("r1", { status: "running", finished_at: null, total: 3 })]);
    renderTab();
    expect(screen.getByRole("button", { name: "Run eval (3)" })).toBeDisabled();
  });

  it("a running run shows its status in a polite live region", () => {
    state.data = overview(THREE(), [run("r1", { status: "running", finished_at: null, total: 3 })]);
    renderTab();
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    expect(live).toHaveTextContent("Running 3 cases…");
  });

  it("a failed newer run shows its reason", () => {
    state.data = overview(THREE(), [
      run("r2", { status: "failed", error: "interrupted" }),
      run("r1"),
    ]);
    renderTab();
    expect(screen.getByRole("status")).toHaveTextContent("Run failed: interrupted");
  });

  it("no status line when the newest run completed", () => {
    state.data = overview(THREE(), [run("r1")]);
    renderTab();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("Delete opens the dialog; Cancel does not delete, Confirm does", () => {
    state.data = overview(THREE());
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.delete })[0]!);
    expect(screen.getByText('Delete "case-c1"? This cannot be undone.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.deleteConfirm.cancel }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete "case-c1"? This cannot be undone.')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.delete })[0]!);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.deleteConfirm.confirm }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]![0]).toBe("c1");
  });

  it("a failed delete keeps the row and shows the error", () => {
    state.data = overview(THREE());
    deleteMutate.mockImplementation((_id, opts) => opts.onError(new Error("boom")));
    renderTab();
    fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.delete })[0]!);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: evalMessages.deleteConfirm.confirm }));
    expect(screen.getByText("case-c1")).toBeInTheDocument();
    expect(screen.getByText(evalMessages.deleteFailed)).toBeInTheDocument();
  });

  it("shows loading", () => {
    state.isLoading = true;
    renderTab();
    expect(screen.getByText(evalMessages.evalsTab.loadingCases)).toBeInTheDocument();
  });

  it("shows an error with a retry that refetches", () => {
    state.isError = true;
    renderTab();
    expect(screen.getByText(evalMessages.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: evalMessages.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state", () => {
    state.data = overview([]);
    renderTab();
    expect(screen.getByText(evalMessages.evalsTab.emptyCases)).toBeInTheDocument();
  });

  it("on mount reads the overview for the agent and runs no mutation", () => {
    state.data = overview(THREE());
    renderTab();
    expect(overviewCall).toHaveBeenCalledWith("a1");
    expect(runMutate).not.toHaveBeenCalled();
    expect(deleteMutate).not.toHaveBeenCalled();
  });
  describe("single-case run and edit", () => {
    const RESULT = { status: "passed", error: null, kept: 1, dropped: 0, kept_findings: [], cost_usd: null, duration_ms: 1800 };
    const rowOf = (name: string) => screen.getByText(name).closest("div")!.parentElement as HTMLElement;

    it("links to the full dashboard", () => {
      state.data = overview(THREE());
      renderTab();
      expect(screen.getByRole("link", { name: evalMessages.evalsTab.viewDashboard })).toHaveAttribute("href", "/eval");
    });

    it("every row has Run and Edit beside Delete", () => {
      state.data = overview(THREE());
      renderTab();
      expect(screen.getAllByRole("button", { name: evalMessages.evalsTab.run })).toHaveLength(3);
      expect(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })).toHaveLength(3);
    });

    it("Run shows the result inline on that row only; no refetch, history untouched", async () => {
      state.data = overview(THREE(), [run("r1")]);
      runCaseAsync.mockResolvedValue(RESULT);
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.run })[1]!);
      expect(runCaseAsync).toHaveBeenCalledWith("c2");
      const result = await screen.findByTestId("single-run-result");
      expect(rowOf("case-c2")).toContainElement(result);
      expect(result).toHaveTextContent("—");
      expect(screen.getAllByTestId("single-run-result")).toHaveLength(1);
      // not a run: no overview refetch, no run mutation, the row's stored status is unchanged
      expect(refetch).not.toHaveBeenCalled();
      expect(runMutate).not.toHaveBeenCalled();
      expect(within(rowOf("case-c2")).getByText(evalMessages.status.failed)).toBeInTheDocument();
      expect(screen.getAllByRole("row")).toHaveLength(2);
    });

    it("the row shows a pending state while its run is in flight", async () => {
      state.data = overview(THREE());
      let done!: (v: unknown) => void;
      runCaseAsync.mockReturnValue(new Promise((r) => (done = r)));
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.run })[0]!);
      expect(await screen.findByRole("button", { name: evalMessages.evalsTab.running })).toBeDisabled();
      expect(screen.getAllByRole("button", { name: evalMessages.evalsTab.run })).toHaveLength(2);
      done(RESULT);
      await screen.findByTestId("single-run-result");
      expect(screen.queryByRole("button", { name: evalMessages.evalsTab.running })).not.toBeInTheDocument();
    });

    it("a failed Run shows the reason inline", async () => {
      state.data = overview(THREE());
      runCaseAsync.mockRejectedValue(new Error("boom"));
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.run })[0]!);
      expect(await screen.findByText(evalMessages.turnInto.errors.runGeneric)).toBeInTheDocument();
    });

    it("Edit opens a form with name and lines prefilled; file and type are not inputs", () => {
      state.data = overview(THREE());
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })[0]!);
      expect(screen.getByLabelText(evalMessages.evalsTab.nameLabel)).toHaveValue("case-c1");
      expect(screen.getByLabelText(evalMessages.evalsTab.startLabel)).toHaveValue("11");
      expect(screen.getByLabelText(evalMessages.evalsTab.endLabel)).toHaveValue("14");
      expect(screen.getAllByRole("textbox")).toHaveLength(3);
    });

    it("Save patches with the trimmed edit and closes the form", () => {
      state.data = overview(THREE());
      updateMutate.mockImplementation((_v, opts) => opts.onSuccess());
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })[0]!);
      fireEvent.change(screen.getByLabelText(evalMessages.evalsTab.nameLabel), { target: { value: " new " } });
      fireEvent.change(screen.getByLabelText(evalMessages.evalsTab.endLabel), { target: { value: "20" } });
      fireEvent.click(screen.getByRole("button", { name: evalMessages.evalsTab.save }));
      expect(updateMutate.mock.calls[0]![0]).toEqual({
        caseId: "c1",
        edit: { name: "new", start_line: 11, end_line: 20 },
      });
      expect(screen.queryByLabelText(evalMessages.evalsTab.nameLabel)).not.toBeInTheDocument();
    });

    it("a server refusal stays inline and keeps the form and edits", () => {
      state.data = overview(THREE());
      updateMutate.mockImplementation((_v, opts) =>
        opts.onError(new ApiError("x", 409, "eval_case_conflict", { case_name: "other" })),
      );
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })[0]!);
      fireEvent.change(screen.getByLabelText(evalMessages.evalsTab.nameLabel), { target: { value: "mine" } });
      fireEvent.click(screen.getByRole("button", { name: evalMessages.evalsTab.save }));
      expect(screen.getByRole("alert")).toHaveTextContent("other");
      expect(screen.getByLabelText(evalMessages.evalsTab.nameLabel)).toHaveValue("mine");
    });

    it("client validation disables Save with a reason", () => {
      state.data = overview(THREE());
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })[0]!);
      fireEvent.change(screen.getByLabelText(evalMessages.evalsTab.startLabel), { target: { value: "30" } });
      expect(screen.getByRole("button", { name: evalMessages.evalsTab.save })).toBeDisabled();
      expect(screen.getByRole("alert")).toHaveTextContent(evalMessages.caseModal.validation.startAfterEnd);
    });

    it("Cancel closes the form without patching", () => {
      state.data = overview(THREE());
      renderTab();
      fireEvent.click(screen.getAllByRole("button", { name: evalMessages.evalsTab.edit })[0]!);
      fireEvent.click(screen.getByRole("button", { name: evalMessages.evalsTab.cancel }));
      expect(updateMutate).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(evalMessages.evalsTab.nameLabel)).not.toBeInTheDocument();
    });
  });

  describe("metrics and history", () => {
    const T = (n: number) => `2026-05-0${n}T10:00:00.000Z`;
    const stamp = (n: number) => new Date(T(n)).toLocaleString();
    const HISTORY = () => [
      run("r4", { status: "running", finished_at: null, started_at: T(4), passed: 2, total: 8, recall: null, precision: null, citation_accuracy: null }),
      run("r3", { status: "failed", error: "x", started_at: T(3), passed: 0, total: 0 }),
      run("r2", { started_at: T(2), recall: 0.5, precision: 0.25, citation_accuracy: 1, passed: 5, total: 8, cost_usd: 0.5 }),
      run("r1", { started_at: T(1), recall: 1, passed: 8, total: 8, cost_usd: null }),
    ];

    it("shows the metrics and N/M of the latest completed run, not the newer running one", () => {
      state.data = overview(THREE(), HISTORY());
      renderTab();
      expect(screen.getByText("5/8 passed")).toBeInTheDocument();
      expect(screen.queryByText("2/8 passed")).not.toBeInTheDocument();
      expect(screen.getByText("RECALL")).toBeInTheDocument();
    });

    it("lists the history newest first with every column", () => {
      state.data = overview(THREE(), HISTORY());
      renderTab();
      const rows = screen.getAllByRole("row").slice(1);
      expect(rows).toHaveLength(4);
      expect(rows[0]).toHaveTextContent(stamp(4));
      expect(rows[3]).toHaveTextContent(stamp(1));
      for (const h of ["ranAt", "status", "version", "recall", "precision", "citation", "pass", "cost"] as const) {
        expect(screen.getByRole("columnheader", { name: evalMessages.dashboard.table[h] })).toBeInTheDocument();
      }
      expect(rows[2]).toHaveTextContent("v1");
      expect(rows[2]).toHaveTextContent("50%");
      expect(rows[2]).toHaveTextContent("5/8");
    });

    it("renders an unpriced run's cost as a dash, never $0.00", () => {
      state.data = overview(THREE(), [run("r1", { cost_usd: null })]);
      renderTab();
      const row = screen.getAllByRole("row")[1]!;
      expect(row).toHaveTextContent("—");
      expect(row).not.toHaveTextContent("$0.00");
    });

    it("shows the empty history text without runs and no metrics", () => {
      state.data = overview(THREE());
      renderTab();
      expect(screen.getByText(evalMessages.history.empty)).toBeInTheDocument();
      expect(screen.queryByText("RECALL")).not.toBeInTheDocument();
    });

    it("two completed runs selected: Compare navigates with both ids", () => {
      state.data = overview(THREE(), HISTORY());
      renderTab();
      const compare = screen.getByRole("button", { name: evalMessages.history.compareSelected });
      expect(compare).toBeDisabled();
      fireEvent.click(screen.getByRole("checkbox", { name: T(2) }));
      expect(compare).toBeDisabled();
      fireEvent.click(screen.getByRole("checkbox", { name: T(1) }));
      expect(compare).toBeEnabled();
      fireEvent.click(compare);
      expect(push).toHaveBeenCalledWith("/eval/compare?a=r1&b=r2");
    });

    it("three selected disables Compare again", () => {
      state.data = overview(THREE(), [...HISTORY(), run("r0", { started_at: T(5) })]);
      renderTab();
      for (const n of [1, 2, 5]) fireEvent.click(screen.getByRole("checkbox", { name: T(n) }));
      expect(screen.getByRole("button", { name: evalMessages.history.compareSelected })).toBeDisabled();
    });

    it("running and failed runs have no checkbox", () => {
      state.data = overview(THREE(), HISTORY());
      renderTab();
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    it("drops a selected run that left the list", () => {
      state.data = overview(THREE(), HISTORY());
      const view = renderTab();
      fireEvent.click(screen.getByRole("checkbox", { name: T(2) }));
      fireEvent.click(screen.getByRole("checkbox", { name: T(1) }));
      expect(screen.getByRole("button", { name: evalMessages.history.compareSelected })).toBeEnabled();
      state.data = overview(THREE(), HISTORY().filter((r) => r.id !== "r1"));
      view.rerender(
        <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
          <EvalsTab agent={AGENT} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("button", { name: evalMessages.history.compareSelected })).toBeDisabled();
    });
  });
});
