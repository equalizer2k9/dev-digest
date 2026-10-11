import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let activeRuns: { run_id: string }[] = [];
vi.mock("../api", () => ({
  API_BASE: "http://api.test",
  api: {
    get: vi.fn(async (path: string) => {
      if (path.endsWith("/runs/active")) return activeRuns;
      if (path.endsWith("/smart-diff")) return { groups: [] };
      return [];
    }),
    del: vi.fn(async () => ({ ok: true })),
  },
}));

import { useDeleteReview, useDeleteRun, useRefreshReviewsOnRunSettle } from "./reviews";

afterEach(cleanup);
beforeEach(() => {
  activeRuns = [];
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(() => useRefreshReviewsOnRunSettle("pr1"), { wrapper });
  const refetchActive = () =>
    act(async () => {
      await qc.refetchQueries({ queryKey: ["pr-active-runs", "pr1"] });
    });
  return { qc, invalidate, hook, refetchActive };
}

const invalidatedKeys = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey: unknown }).queryKey));

describe("useRefreshReviewsOnRunSettle", () => {
  it("does nothing while no run has ever been active", async () => {
    const { qc, invalidate, refetchActive } = setup();
    await waitFor(() => expect(qc.getQueryState(["pr-active-runs", "pr1"])?.status).toBe("success"));
    await refetchActive();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("invalidates reviews and smart-diff when active runs go from some to none", async () => {
    activeRuns = [{ run_id: "r1" }];
    const { qc, invalidate, refetchActive } = setup();
    await waitFor(() => expect(qc.getQueryData(["pr-active-runs", "pr1"])).toHaveLength(1));
    expect(invalidate).not.toHaveBeenCalled();

    activeRuns = [];
    await refetchActive();

    await waitFor(() => {
      const keys = invalidatedKeys(invalidate);
      expect(keys).toContain(JSON.stringify(["reviews", "pr1"]));
      expect(keys).toContain(JSON.stringify(["smart-diff", "pr1"]));
    });
  });

  it("does not fire while runs are still active", async () => {
    activeRuns = [{ run_id: "r1" }];
    const { qc, invalidate, refetchActive } = setup();
    await waitFor(() => expect(qc.getQueryData(["pr-active-runs", "pr1"])).toHaveLength(1));
    activeRuns = [{ run_id: "r1" }, { run_id: "r2" }];
    await refetchActive();
    expect(invalidate).not.toHaveBeenCalled();
  });
});

describe("mutations that remove findings", () => {
  function setupMutation<T>(useHook: () => T) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children);
    return { invalidate, hook: renderHook(useHook, { wrapper }) };
  }

  it("deleting a review invalidates reviews and smart-diff", async () => {
    const { invalidate, hook } = setupMutation(() => useDeleteReview("pr1"));
    await act(async () => {
      await hook.result.current.mutateAsync("rv1");
    });
    const keys = invalidatedKeys(invalidate);
    expect(keys).toContain(JSON.stringify(["reviews", "pr1"]));
    expect(keys).toContain(JSON.stringify(["smart-diff", "pr1"]));
  });

  it("deleting a run invalidates reviews and smart-diff", async () => {
    const { invalidate, hook } = setupMutation(() => useDeleteRun("pr1"));
    await act(async () => {
      await hook.result.current.mutateAsync("run1");
    });
    const keys = invalidatedKeys(invalidate);
    expect(keys).toContain(JSON.stringify(["reviews", "pr1"]));
    expect(keys).toContain(JSON.stringify(["smart-diff", "pr1"]));
  });
});
