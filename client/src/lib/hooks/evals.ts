/* hooks/evals.ts — React Query hooks for the eval pipeline (SPEC-03): the Evals tab of an
   agent, run compare and the workspace dashboard. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentOverview,
  EvalCaseCreated,
  EvalCaseDraft,
  EvalCaseEdit,
  EvalCaseRow,
  EvalCompare,
  EvalDashboard,
  EvalRunRecord,
  EvalSingleRun,
} from "@devdigest/shared";

const POLL_MS = 2500;

export function useEvalOverview(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-overview", agentId],
    queryFn: () => api.get<EvalAgentOverview>(`/agents/${agentId}/evals`),
    enabled: !!agentId,
    refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "running") ? POLL_MS : false),
  });
}

/** Opens the "Turn into eval case" modal (AC-46): reads the draft; no model call, stores nothing. */
export function useLoadEvalCaseDraft() {
  return useMutation({
    mutationFn: (findingId: string) => api.get<EvalCaseDraft>(`/findings/${findingId}/eval-case/draft`),
  });
}

/** Save in the modal: creates the case, with the edited name and zone when given (AC-47). */
export function useCreateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ findingId, edit }: { findingId: string; edit?: EvalCaseEdit }) =>
      api.post<EvalCaseCreated>(`/findings/${findingId}/eval-case`, edit),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["eval-overview", res.agent_id] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Run case in the modal (AC-48): reviews the unsaved case once. Stores nothing, so no invalidation. */
export function useRunDraftCase() {
  return useMutation({
    mutationFn: ({ findingId, edit }: { findingId: string; edit: EvalCaseEdit }) =>
      api.post<EvalSingleRun>(`/findings/${findingId}/eval-case/run`, edit),
  });
}

/** Run on a stored case (AC-49). Not a run (AC-50): the overview and dashboard stay as they are. */
export function useRunEvalCase(agentId: string) {
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalSingleRun>(`/agents/${agentId}/evals/cases/${caseId}/run`),
  });
}

/** Edit on a stored case (AC-51): name and zone only. */
export function useUpdateEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, edit }: { caseId: string; edit: EvalCaseEdit }) =>
      api.patch<EvalCaseRow>(`/agents/${agentId}/evals/cases/${caseId}`, edit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-overview", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** Pessimistic: the cache only changes after the server confirmed the delete. */
export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<void>(`/agents/${agentId}/evals/cases/${caseId}`),
    onSuccess: (_d, caseId) => {
      qc.setQueryData<EvalAgentOverview>(["eval-overview", agentId], (old) =>
        old ? { ...old, cases: old.cases.filter((c) => c.id !== caseId) } : old,
      );
      qc.invalidateQueries({ queryKey: ["eval-overview", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

export function useRunEval(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalRunRecord>(`/agents/${agentId}/evals/runs`),
    onSuccess: (run) => {
      qc.setQueryData<EvalAgentOverview>(["eval-overview", agentId], (old) =>
        old ? { ...old, runs: [run, ...old.runs.filter((r) => r.id !== run.id)] } : old,
      );
      qc.invalidateQueries({ queryKey: ["eval-overview", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

export function useEvalCompare(a: string | null | undefined, b: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-compare", a, b],
    queryFn: () => api.get<EvalCompare>(`/evals/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
  });
}

export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboard>("/evals/dashboard"),
  });
}
