import React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const get = vi.fn();
const put = vi.fn();
vi.mock("../api", () => ({
  API_BASE: "http://api.test",
  api: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
  },
}));

import {
  useContextAttachments,
  useContextDocument,
  useContextDocuments,
  useSetContextAttachments,
} from "./project-context";

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  put.mockReset();
  get.mockResolvedValue({});
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

const ATTACHMENTS = { repo_id: "r1", attached: ["docs/a.md"], effective: [] };

describe("useContextDocuments", () => {
  it("issues one GET to /repos/:id/context", async () => {
    const { wrapper } = setup();
    renderHook(() => useContextDocuments("r1"), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/repos/r1/context");
  });

  it("is disabled for a null repo", async () => {
    const { wrapper } = setup();
    renderHook(() => useContextDocuments(null), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useContextDocument", () => {
  it("requests the encoded path", async () => {
    const { wrapper } = setup();
    renderHook(() => useContextDocument("r1", "docs/a b.md"), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/repos/r1/context/document?path=docs%2Fa%20b.md");
  });

  it("issues nothing for a null path", async () => {
    const { wrapper } = setup();
    renderHook(() => useContextDocument("r1", null), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(get).not.toHaveBeenCalled();
  });
});

describe("useSetContextAttachments", () => {
  it("puts repo_id + paths for an agent and writes the response into the cache", async () => {
    put.mockResolvedValue(ATTACHMENTS);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useSetContextAttachments("agent", "a1", "r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["docs/a.md"]);
    });
    expect(put).toHaveBeenCalledWith("/agents/a1/context", { repo_id: "r1", paths: ["docs/a.md"] });
    expect(qc.getQueryData(["context-attachments", "agent", "a1", "r1"])).toEqual(ATTACHMENTS);
    expect(get).not.toHaveBeenCalled();
  });

  it("uses /skills/:id/context for a skill", async () => {
    put.mockResolvedValue(ATTACHMENTS);
    const { wrapper } = setup();
    const { result } = renderHook(() => useSetContextAttachments("skill", "s1", "r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["docs/a.md"]);
    });
    expect(put).toHaveBeenCalledWith("/skills/s1/context", { repo_id: "r1", paths: ["docs/a.md"] });
  });

  it("keeps the previous data when the write is rejected", async () => {
    put.mockRejectedValue(new Error("boom"));
    const { qc, wrapper } = setup();
    qc.setQueryData(["context-attachments", "agent", "a1", "r1"], ATTACHMENTS);
    const { result } = renderHook(() => useSetContextAttachments("agent", "a1", "r1"), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(["x.md"]).catch(() => {});
    });
    expect(qc.getQueryData(["context-attachments", "agent", "a1", "r1"])).toEqual(ATTACHMENTS);
  });
});

describe("useContextAttachments", () => {
  it("GETs with repo_id in the query string", async () => {
    const { wrapper } = setup();
    renderHook(() => useContextAttachments("skill", "s1", "r1"), { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    expect(get).toHaveBeenCalledWith("/skills/s1/context?repo_id=r1");
  });
});
