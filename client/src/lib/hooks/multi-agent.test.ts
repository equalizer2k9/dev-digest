import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { MultiRunDetail } from "@devdigest/shared";

vi.mock("../api", () => ({
  API_BASE: "http://api.test",
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() },
}));

import { api } from "../api";
import {
  MULTI_RUN_POLL_MS,
  hasInProgress,
  useAgentEstimates,
  useLaunchMultiRun,
  useMultiRun,
  useMultiRuns,
} from "./multi-agent";

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function detail(statuses: (string | null)[]): MultiRunDetail {
  return {
    id: "m1",
    pr: { id: "pr1", number: 1, title: "T", repo_id: "r1" },
    status: "running",
    started_at: "2026-10-16T10:00:00Z",
    wall_clock_ms: null,
    tokens_in: 0,
    tokens_out: 0,
    cost_usd: null,
    agents: statuses.map((status, i) => ({
      run_id: `run${i}`,
      agent_id: `a${i}`,
      agent_name: `Agent ${i}`,
      status,
      error: null,
      duration_ms: null,
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      findings_count: null,
      score: null,
    })),
    groups: [],
  };
}

function setup<T>(useHook: () => T) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, hook: renderHook(useHook, { wrapper }) };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe("useLaunchMultiRun", () => {
  it("posts { agentIds } to /pulls/:id/review and resolves multi_run_id (AC-1)", async () => {
    post.mockResolvedValue({ pr_id: "pr1", runs: [], reviews: [], multi_run_id: "m1" });
    const { hook } = setup(() => useLaunchMultiRun());
    let res: { multi_run_id: string } | undefined;
    await act(async () => {
      res = await hook.result.current.mutateAsync({ prId: "pr1", agentIds: ["a", "b"] });
    });
    expect(post).toHaveBeenCalledWith("/pulls/pr1/review", { agentIds: ["a", "b"] });
    expect(res?.multi_run_id).toBe("m1");
  });
});

describe("hasInProgress", () => {
  it("treats null, queued and running as in progress", () => {
    expect(hasInProgress(detail(["done", null]))).toBe(true);
    expect(hasInProgress(detail(["queued"]))).toBe(true);
    expect(hasInProgress(detail(["done", "failed", "cancelled"]))).toBe(false);
  });
});

describe("useMultiRun", () => {
  it("re-requests every 2 s while an agent run is running (AC-8)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValue(detail(["running", "done"]));
    setup(() => useMultiRun("m1"));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/multi-runs/m1");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_RUN_POLL_MS);
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_RUN_POLL_MS);
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  });

  it("stops re-requesting once no agent run is in progress (AC-8)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get.mockResolvedValueOnce(detail(["running"])).mockResolvedValue(detail(["done"]));
    setup(() => useMultiRun("m1"));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_RUN_POLL_MS);
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("a failed re-request keeps the last data and keeps polling (EC-11)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    get
      .mockResolvedValueOnce(detail(["running"]))
      .mockRejectedValueOnce(new Error("down"))
      .mockResolvedValue(detail(["running"]));
    const { hook } = setup(() => useMultiRun("m1"));
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_RUN_POLL_MS);
    });
    await vi.waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data?.agents).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MULTI_RUN_POLL_MS);
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(3));
  });
});

describe("useMultiRuns", () => {
  it("requests /multi-runs?pr_id=… with a prId and /multi-runs without (AC-12)", async () => {
    get.mockResolvedValue([]);
    const a = setup(() => useMultiRuns("pr1"));
    await waitFor(() => expect(a.hook.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/multi-runs?pr_id=pr1");
    get.mockClear();
    const b = setup(() => useMultiRuns());
    await waitFor(() => expect(b.hook.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/multi-runs");
  });
});

describe("useAgentEstimates", () => {
  it("requests /multi-runs/estimates (AC-6)", async () => {
    get.mockResolvedValue({ agents: [] });
    const { hook } = setup(() => useAgentEstimates());
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith("/multi-runs/estimates");
  });
});
