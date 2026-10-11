import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrBrief } from "@devdigest/shared";

vi.mock("../api", () => ({
  API_BASE: "http://api.test",
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { api } from "../api";
import { useGenerateBrief, usePrBrief } from "./brief";

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const BRIEF: PrBrief = {
  summary: "S",
  risks: [],
  review_focus: [],
  head_sha: "sha1",
  intent: null,
  history: null,
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ brief: null });
});

function setup(prId: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  const hook = renderHook(
    () => ({ query: usePrBrief(prId), generate: useGenerateBrief(prId) }),
    { wrapper },
  );
  return { qc, hook };
}

describe("usePrBrief", () => {
  it("issues one GET to /pulls/:id/brief on mount and never a POST", async () => {
    const { hook } = setup("pr1");
    await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("/pulls/pr1/brief");
    expect(post).not.toHaveBeenCalled();
  });

  it("is disabled for a null PR id", async () => {
    const { hook } = setup(null);
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
    expect(hook.result.current.query.fetchStatus).toBe("idle");
  });
});

describe("useGenerateBrief", () => {
  it("posts { head_sha } and writes the response into the cache without a refetch", async () => {
    post.mockResolvedValue({ brief: BRIEF });
    const { hook } = setup("pr1");
    await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));

    await act(async () => {
      await hook.result.current.generate.mutateAsync("sha1");
    });

    expect(post).toHaveBeenCalledWith("/pulls/pr1/brief", { head_sha: "sha1" });
    await waitFor(() => expect(hook.result.current.query.data).toEqual({ brief: BRIEF }));
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("leaves the previous query data in place when the mutation rejects", async () => {
    get.mockResolvedValue({ brief: BRIEF });
    post.mockRejectedValue(new Error("boom"));
    const { hook } = setup("pr1");
    await waitFor(() => expect(hook.result.current.query.data).toEqual({ brief: BRIEF }));

    await act(async () => {
      await hook.result.current.generate.mutateAsync("sha2").catch(() => {});
    });

    expect(hook.result.current.query.data).toEqual({ brief: BRIEF });
    await waitFor(() => expect(hook.result.current.generate.isError).toBe(true));
  });
});
