import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentResponse } from "@devdigest/shared";

let activeRuns: { run_id: string }[] = [];
const get = vi.fn();
const post = vi.fn();
vi.mock("../api", () => ({
  API_BASE: "http://api.test",
  api: {
    get: (...a: unknown[]) => get(...a),
    post: (...a: unknown[]) => post(...a),
  },
}));

import { useIntent, useRecalculateIntent } from "./intent";
import { useRefreshReviewsOnRunSettle } from "./reviews";

afterEach(cleanup);
beforeEach(() => {
  activeRuns = [];
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path.endsWith("/runs/active")) return activeRuns;
    if (path.endsWith("/intent")) return { intent: null };
    return [];
  });
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe("intent hooks", () => {
  it("AC-7: useIntent GETs /pulls/:id/intent under key ['pr-intent', prId]", async () => {
    const { qc, wrapper } = setup();
    renderHook(() => useIntent("pr1"), { wrapper });
    await waitFor(() => expect(qc.getQueryData(["pr-intent", "pr1"])).toEqual({ intent: null }));
    expect(get).toHaveBeenCalledWith("/pulls/pr1/intent");
  });

  it("AC-7: useIntent is disabled without a prId", async () => {
    const { wrapper } = setup();
    renderHook(() => useIntent(undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });

  it("AC-3/7: mounting useRecalculateIntent never POSTs", async () => {
    const { wrapper } = setup();
    renderHook(() => useRecalculateIntent("pr1"), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(post).not.toHaveBeenCalled();
  });

  it("AC-7: useRecalculateIntent POSTs and writes the result into the intent key", async () => {
    const res = { intent: { intent: "x", confidence: "low" } } as unknown as PrIntentResponse;
    post.mockResolvedValue(res);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useRecalculateIntent("pr1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post.mock.calls[0]?.[0]).toBe("/pulls/pr1/intent/recalculate");
    expect(qc.getQueryData(["pr-intent", "pr1"])).toEqual(res);
  });

  it("AC-7: the intent key is invalidated when the PR's active runs settle", async () => {
    activeRuns = [{ run_id: "r1" }];
    const { qc, wrapper } = setup();
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    renderHook(() => useRefreshReviewsOnRunSettle("pr1"), { wrapper });
    await waitFor(() => expect(qc.getQueryData(["pr-active-runs", "pr1"])).toHaveLength(1));
    activeRuns = [];
    await act(async () => {
      await qc.refetchQueries({ queryKey: ["pr-active-runs", "pr1"] });
    });
    await waitFor(() => {
      const keys = invalidate.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));
      expect(keys).toContain(JSON.stringify(["pr-intent", "pr1"]));
    });
  });
});
