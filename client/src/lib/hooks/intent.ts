/* hooks/intent.ts — the PR intent card's data. Reading never spends a model
   call; only the recalculate mutation does. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrIntentResponse } from "@devdigest/shared";

export function useIntent(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-intent", prId],
    queryFn: () => api.get<PrIntentResponse>(`/pulls/${prId}/intent`),
    enabled: !!prId,
  });
}

export function useRecalculateIntent(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrIntentResponse>(`/pulls/${prId}/intent/recalculate`),
    onSuccess: (res) => {
      qc.setQueryData(["pr-intent", prId], res);
    },
  });
}
