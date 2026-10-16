import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CiRunRow } from "@devdigest/shared";

const run = (id: string): CiRunRow => ({
  id,
  repo: "acme/api",
  pr_number: 7,
  agent_id: "a1",
  agent: "Security",
  status: "succeeded",
  findings_count: 1,
  cost_usd: 0.01,
  duration_s: 12,
  ran_at: "2026-05-01T10:00:00.000Z",
  github_url: "https://github.com/acme/api/actions/runs/1",
});

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api", () => ({ API_BASE: "http://api.test", api: { get, post } }));

import { useCiRuns, useInstallCi, useRefreshCiRuns } from "./ci";

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockResolvedValue({ runs: [run("old")] });
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe("useCiRuns", () => {
  it("GETs /ci/runs?agent_id= for an agent and never POSTs on mount", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useCiRuns("a1"), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledWith("/ci/runs?agent_id=a1");
    expect(post).not.toHaveBeenCalled();
  });

  it("GETs /ci/runs without an agent", async () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useCiRuns(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(get).toHaveBeenCalledWith("/ci/runs");
    expect(post).not.toHaveBeenCalled();
  });
});

describe("useRefreshCiRuns", () => {
  it("posts once and writes the returned runs into the cache without a refetch of the list", async () => {
    post.mockResolvedValue({ runs: [run("new")], error: null, ingested: 1, skipped: 0 });
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useRefreshCiRuns(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith("/ci/runs/refresh");
    expect(qc.getQueryData(["ci-runs", "all"])).toEqual({ runs: [run("new")] });
    // No observer is mounted, so the invalidation triggers no GET.
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useInstallCi", () => {
  it("posts the body as given, including an edited workflow", async () => {
    post.mockResolvedValue({ pr_url: "https://github.com/acme/api/pull/1" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useInstallCi("a1"), { wrapper });
    const body = {
      repo_id: "11111111-1111-4111-8111-111111111111",
      triggers: ["opened" as const],
      post_as: "github_review" as const,
      workflow: "name: edited",
    };
    await act(async () => {
      await result.current.mutateAsync(body);
    });
    expect(post).toHaveBeenCalledWith("/agents/a1/ci/install", body);
  });
});
