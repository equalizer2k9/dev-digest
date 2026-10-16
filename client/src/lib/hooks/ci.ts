/* hooks/ci.ts — React Query hooks for Export to CI (SPEC-05): the export wizard, the agent's
   CI tab and the workspace CI Runs page. Ingest happens only in useRefreshCiRuns. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CiBundleInput,
  CiInstallation,
  CiInstallInput,
  CiInstallResult,
  CiPreview,
  CiRefreshResult,
  CiRunsResponse,
} from "@devdigest/shared";

export function useCiInstallations(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["ci-installations", agentId],
    queryFn: () => api.get<CiInstallation[]>(`/agents/${agentId}/ci/installations`),
    enabled: !!agentId,
  });
}

/** Reads only — a mount never ingests (NFR-5). */
export function useCiRuns(agentId?: string) {
  return useQuery({
    queryKey: ["ci-runs", agentId ?? "all"],
    queryFn: () => api.get<CiRunsResponse>(agentId ? `/ci/runs?agent_id=${encodeURIComponent(agentId)}` : "/ci/runs"),
  });
}

/** Ingest new artifacts from GitHub; the returned list becomes the workspace-wide cache. */
export function useRefreshCiRuns() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CiRefreshResult>("/ci/runs/refresh"),
    onSuccess: (res) => {
      qc.setQueryData<CiRunsResponse>(["ci-runs", "all"], { runs: res.runs });
      qc.invalidateQueries({ queryKey: ["ci-runs"] });
    },
  });
}

export function usePreviewCi(agentId: string) {
  return useMutation({
    mutationFn: (body: CiBundleInput) => api.post<CiPreview>(`/agents/${agentId}/ci/preview`, body),
  });
}

export function useInstallCi(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CiInstallInput) => api.post<CiInstallResult>(`/agents/${agentId}/ci/install`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ci-installations", agentId] }),
  });
}
