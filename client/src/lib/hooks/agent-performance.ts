/* hooks/agent-performance.ts — React Query hooks for the Agent Performance dashboard and the
   agent's Stats tab (SPEC-06). Reads only: no mutation, no polling, so sorting or expanding a
   row never reaches the network (the data is already in the response). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { periodSearch, type PeriodParams } from "../agent-performance";
import type { AgentPerformance, AgentStats } from "@devdigest/shared";

export function useAgentPerformance(p: PeriodParams) {
  const q = periodSearch(p);
  return useQuery({
    queryKey: ["agent-performance", q],
    queryFn: () => api.get<AgentPerformance>(`/agent-performance?${q}`),
  });
}

export function useAgentStats(agentId: string | null | undefined, p: PeriodParams) {
  const q = periodSearch(p);
  return useQuery({
    queryKey: ["agent-stats", agentId, q],
    queryFn: () => api.get<AgentStats>(`/agents/${agentId}/stats?${q}`),
    enabled: !!agentId,
  });
}
