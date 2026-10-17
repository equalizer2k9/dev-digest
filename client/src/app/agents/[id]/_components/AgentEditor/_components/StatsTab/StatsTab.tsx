/* StatsTab — the agent's Stats tab: the same cards as the dashboard row, for the period held in
   the URL (?period=…, kept next to ?tab=stats). GET /agents/:id/stats is by construction this
   agent's row of the dashboard. Loading and error show no number; an empty period shows the
   empty state and the selector. No severity breakdown or trend (A-11). */
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { KpiCard } from "@/components/agent-performance/KpiCard";
import { PeriodSelector } from "@/components/agent-performance/PeriodSelector";
import {
  formatDuration,
  formatRate,
  formatUsd,
  parsePeriodParams,
  periodCaption,
  withPeriod,
  type PeriodParams,
} from "@/lib/agent-performance";
import { useAgentStats } from "@/lib/hooks/agent-performance";
import { s } from "./styles";

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agentPerformance");
  const router = useRouter();
  const search = useSearchParams();
  const period = parsePeriodParams(search);
  const { data, isLoading, isError, refetch } = useAgentStats(agent.id, period);

  const onPeriod = (p: PeriodParams) => router.replace(`/agents/${agent.id}?${withPeriod(search, p)}`);
  const cap = periodCaption(period, t);

  const body = () => {
    if (isLoading) {
      return (
        <div role="status" aria-live="polite" aria-busy="true">
          <div style={s.note}>{t("loading")}</div>
          <Skeleton height={80} />
        </div>
      );
    }
    if (isError || !data) return <ErrorState title={t("loadError")} onRetry={() => refetch()} />;
    if (data.runs === 0) {
      return (
        <div>
          <div style={s.emptyTitle}>{t("empty.title")}</div>
          <div style={s.note}>{t("empty.body")}</div>
        </div>
      );
    }
    return (
      <div style={s.cards}>
        <KpiCard label={t("stats.totalRuns")} value={String(data.runs)} caption={cap} />
        <KpiCard
          label={t("stats.avgCost")}
          value={data.avg_cost_usd === null ? null : formatUsd(data.avg_cost_usd)}
          caption={
            <>
              <span style={s.line}>{cap}</span>
              <span style={s.line}>{t("kpi.priced", { priced: data.priced_runs, runs: data.runs })}</span>
            </>
          }
          badge={<Badge>{t("costBadge")}</Badge>}
        />
        <KpiCard
          label={t("stats.avgDuration")}
          value={data.avg_latency_ms === null ? null : formatDuration(data.avg_latency_ms)}
          caption={cap}
        />
        <KpiCard
          label={t("stats.acceptRate")}
          value={data.accept_rate === null ? null : formatRate(data.accept_rate)}
          caption={
            <>
              <span style={s.line}>{cap}</span>
              <span style={s.line}>{t("kpi.decided", { accepted: data.accepted, decided: data.decided })}</span>
              <span style={s.line}>{t("acceptLocalOnly")}</span>
            </>
          }
          badge={data.low_sample ? <Badge>{t("table.lowSample")}</Badge> : undefined}
        />
      </div>
    );
  };

  return (
    <div style={s.wrap}>
      <div style={s.head}>
        <PeriodSelector value={period} onChange={onPeriod} />
      </div>
      {body()}
    </div>
  );
}
