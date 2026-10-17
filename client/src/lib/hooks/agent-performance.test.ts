import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PeriodParams } from "../agent-performance";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ API_BASE: "http://api.test", api: { get, post } }));

import { useAgentPerformance, useAgentStats } from "./agent-performance";

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ rows: [] });
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useAgentPerformance", () => {
  it("GETs /agent-performance once, never POSTs, and issues one more GET for a new period", async () => {
    const { result, rerender } = renderHook(({ p }: { p: PeriodParams }) => useAgentPerformance(p), {
      wrapper: wrapper(),
      initialProps: { p: { period: "1d" } as PeriodParams },
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/agent-performance?period=1d");

    rerender({ p: { period: "custom", from: "2026-10-01", to: "2026-10-10" } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get).toHaveBeenLastCalledWith("/agent-performance?period=custom&from=2026-10-01&to=2026-10-10");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("useAgentStats", () => {
  it("GETs /agents/:id/stats with the period", async () => {
    const { result } = renderHook(() => useAgentStats("a1", { period: "30d" }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/agents/a1/stats?period=30d");
    expect(post).not.toHaveBeenCalled();
  });

  it("issues no request without an agent id", () => {
    renderHook(() => useAgentStats(undefined, { period: "30d" }), { wrapper: wrapper() });
    expect(get).not.toHaveBeenCalled();
  });
});
