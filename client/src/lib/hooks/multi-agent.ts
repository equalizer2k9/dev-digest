/* hooks/multi-agent.ts — React Query hooks for multi-agent review (SPEC-04).
     GET  /multi-runs/estimates → AgentEstimates
     POST /pulls/:id/review     → MultiRunLaunchResponse (body { agentIds })
     GET  /multi-runs/:id       → MultiRunDetail (polled while any agent run is in progress)
     GET  /multi-runs[?pr_id=]  → MultiRunList */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentEstimates,
  MultiRunDetail,
  MultiRunLaunchResponse,
  MultiRunList,
} from "@devdigest/shared";
import { api } from "../api";
import { useFindingAction } from "./reviews";

export const MULTI_RUN_POLL_MS = 2000;

/** queued / running / unknown status = the agent run is not finished yet. */
export function isInProgress(status: string | null | undefined): boolean {
  return status == null || status === "queued" || status === "running";
}

export function hasInProgress(detail: MultiRunDetail): boolean {
  return detail.agents.some((a) => isInProgress(a.status));
}

export function useAgentEstimates() {
  return useQuery({
    queryKey: ["multi-run-estimates"],
    queryFn: () => api.get<AgentEstimates>("/multi-runs/estimates"),
  });
}

export function useLaunchMultiRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ prId, agentIds }: { prId: string; agentIds: string[] }) =>
      api.post<MultiRunLaunchResponse>(`/pulls/${prId}/review`, { agentIds }),
    onSuccess: (_d, { prId }) => {
      qc.invalidateQueries({ queryKey: ["multi-runs"] });
      qc.invalidateQueries({ queryKey: ["reviews", prId] });
      qc.invalidateQueries({ queryKey: ["pr-runs", prId] });
    },
  });
}

/** After a failed refetch TanStack keeps `state.data`, so polling continues. */
export function useMultiRun(id: string | null | undefined) {
  return useQuery({
    queryKey: ["multi-run", id],
    queryFn: () => api.get<MultiRunDetail>(`/multi-runs/${id}`),
    enabled: !!id,
    retry: false,
    refetchInterval: (q) => (q.state.data && hasInProgress(q.state.data) ? MULTI_RUN_POLL_MS : false),
  });
}

export function useMultiRuns(prId?: string | null) {
  return useQuery({
    queryKey: ["multi-runs", prId ?? "all"],
    queryFn: () => api.get<MultiRunList>(prId ? `/multi-runs?pr_id=${encodeURIComponent(prId)}` : "/multi-runs"),
  });
}

/** Accept / dismiss a finding on the multi-run page; also refreshes that run. */
export function useMultiRunFindingAction(multiRunId: string) {
  const qc = useQueryClient();
  const action = useFindingAction();
  return {
    ...action,
    mutate: (...[vars, opts]: Parameters<typeof action.mutate>) =>
      action.mutate(vars, {
        ...opts,
        onSettled: (...args) => {
          qc.invalidateQueries({ queryKey: ["multi-run", multiRunId] });
          opts?.onSettled?.(...args);
        },
      }),
  };
}
