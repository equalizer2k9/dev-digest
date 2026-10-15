/* hooks/brief.ts — React Query hooks for the PR Brief.
     GET  /pulls/:id/brief → PrBriefResponse (stored brief or { brief: null }; never a model call)
     POST /pulls/:id/brief → PrBriefResponse (generate; body { head_sha }) */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrBriefGenerateInput, PrBriefResponse } from "@devdigest/shared";
import { api } from "../api";

const briefKey = (prId: string | null | undefined) => ["pr-brief", prId] as const;

export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: briefKey(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate / refresh. On success the response IS the new cache value; on error the cache is untouched. */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (headSha: string) =>
      api.post<PrBriefResponse>(`/pulls/${prId}/brief`, {
        head_sha: headSha,
      } satisfies PrBriefGenerateInput),
    onSuccess: (data) => qc.setQueryData(briefKey(prId), data),
  });
}
