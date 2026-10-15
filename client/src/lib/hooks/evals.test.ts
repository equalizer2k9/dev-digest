import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const run = (id: string, status: string) => ({ id, status });
let overview: { cases: { id: string }[]; runs: { id: string; status: string }[] } = {
  cases: [{ id: "c1" }, { id: "c2" }],
  runs: [run("r0", "completed")],
};

const { get, post, del } = vi.hoisted(() => ({
  get: vi.fn(async (path: string): Promise<unknown> => {
    if (path.startsWith("/agents/a1/evals")) return overview;
    return { ok: true };
  }),
  post: vi.fn(async (path: string): Promise<unknown> => {
    if (path === "/findings/f1/eval-case") return { agent_id: "a1", created: true };
    if (path === "/agents/a1/evals/runs") return { id: "r9", status: "running" };
    return { ok: true };
  }),
  del: vi.fn(async (_path: string): Promise<unknown> => undefined),
}));
vi.mock("../api", () => ({ API_BASE: "http://api.test", api: { get, post, del } }));

import {
  useCreateEvalCase,
  useDeleteEvalCase,
  useEvalCompare,
  useEvalDashboard,
  useEvalOverview,
  useRunEval,
} from "./evals";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  get.mockClear();
  post.mockClear();
  del.mockClear();
  overview = { cases: [{ id: "c1" }, { id: "c2" }], runs: [run("r0", "completed")] };
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe("useEvalOverview", () => {
  it("GETs /agents/a1/evals once; null disables it", async () => {
    const { qc, wrapper } = setup();
    const off = renderHook(() => useEvalOverview(null), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    expect(get).not.toHaveBeenCalled();
    renderHook(() => useEvalOverview("a1"), { wrapper });
    await waitFor(() => expect(qc.getQueryState(["eval-overview", "a1"])?.status).toBe("success"));
    expect(get.mock.calls.map((c) => c[0])).toEqual(["/agents/a1/evals"]);
  });

  it("polls every 2.5 s while a run is running, not when all are completed", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    overview = { cases: [], runs: [run("r1", "running")] };
    const { qc, wrapper } = setup();
    renderHook(() => useEvalOverview("a1"), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    expect(get).toHaveBeenCalledTimes(2);

    overview = { cases: [], runs: [run("r1", "completed")] };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2600);
    });
    const n = get.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(get).toHaveBeenCalledTimes(n);
    expect(qc.getQueryData<typeof overview>(["eval-overview", "a1"])?.runs[0]?.status).toBe("completed");
  });
});

describe("useCreateEvalCase", () => {
  it("POSTs and invalidates the overview and the dashboard", async () => {
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useCreateEvalCase(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("f1");
    });
    expect(post).toHaveBeenCalledWith("/findings/f1/eval-case");
    const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
    expect(keys).toContain(JSON.stringify(["eval-overview", "a1"]));
    expect(keys).toContain(JSON.stringify(["eval-dashboard"]));
  });
});

describe("useDeleteEvalCase", () => {
  it("DELETEs the case and drops it from the cache", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["eval-overview", "a1"], overview);
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1");
    });
    expect(del).toHaveBeenCalledWith("/agents/a1/evals/cases/c1");
    expect(qc.getQueryData<typeof overview>(["eval-overview", "a1"])?.cases.map((c) => c.id)).toEqual(["c2"]);
  });

  it("leaves the cache unchanged on rejection", async () => {
    del.mockRejectedValueOnce(new Error("boom"));
    const { qc, wrapper } = setup();
    qc.setQueryData(["eval-overview", "a1"], overview);
    const { result } = renderHook(() => useDeleteEvalCase("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync("c1").catch(() => undefined);
    });
    expect(qc.getQueryData<typeof overview>(["eval-overview", "a1"])?.cases).toHaveLength(2);
  });
});

describe("useRunEval", () => {
  it("POSTs and puts the running run first in the cache", async () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["eval-overview", "a1"], overview);
    const { result } = renderHook(() => useRunEval("a1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledWith("/agents/a1/evals/runs");
    const runs = qc.getQueryData<typeof overview>(["eval-overview", "a1"])!.runs;
    expect(runs.map((r) => r.id)).toEqual(["r9", "r0"]);
  });
});

describe("compare and dashboard", () => {
  it("useEvalCompare is disabled unless both ids are present", async () => {
    const { wrapper } = setup();
    const off = renderHook(() => useEvalCompare("x", null), { wrapper });
    expect(off.result.current.fetchStatus).toBe("idle");
    const on = renderHook(() => useEvalCompare("x", "y"), { wrapper });
    await waitFor(() => expect(on.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/evals/compare?a=x&b=y");
  });

  it("useEvalDashboard GETs /evals/dashboard; read hooks issue GETs only", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useEvalDashboard(), { wrapper });
    renderHook(() => useEvalOverview("a1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/evals/dashboard");
    expect(post).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    for (const [p] of get.mock.calls) expect(p).toMatch(/^\/(agents\/[^/]+\/evals|evals\/)/);
  });
});
