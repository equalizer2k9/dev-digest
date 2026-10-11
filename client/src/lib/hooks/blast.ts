/* hooks/blast.ts — React Query hook for the PR blast radius.
     GET /pulls/:id/blast → BlastRadiusResponse */
"use client";

import { useQuery } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { api } from "../api";

export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
