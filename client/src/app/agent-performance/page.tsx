/* /agent-performance — Agent Performance dashboard. Thin entry: the period lives in the URL
   (?period=…&from=…&to=…) so a reload keeps it; the whole screen is in AgentPerformanceView. */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { parsePeriodParams, periodSearch, type PeriodParams } from "@/lib/agent-performance";
import { AgentPerformanceView } from "./_components/AgentPerformanceView";

export default function AgentPerformancePage() {
  const router = useRouter();
  const period = parsePeriodParams(useSearchParams());
  const onPeriod = (p: PeriodParams) => router.replace(`/agent-performance?${periodSearch(p)}`);
  return <AgentPerformanceView period={period} onPeriod={onPeriod} />;
}
