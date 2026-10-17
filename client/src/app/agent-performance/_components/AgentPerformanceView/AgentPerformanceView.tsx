/* AgentPerformanceView — /agent-performance. One payload (GET /agent-performance) feeds the KPI
   cards, the per-agent table and the cost breakdown, so sorting or expanding a row never
   fetches. While loading or after an error no number is shown (AC-11); an empty period shows
   only the empty state and the period selector (AC-10). */
"use client";

import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { KpiCard } from "@/components/agent-performance/KpiCard";
import { PeriodSelector } from "@/components/agent-performance/PeriodSelector";
import { formatRate, formatUsd, periodCaption, type PeriodParams } from "@/lib/agent-performance";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import { CostBreakdown } from "../CostBreakdown";
import { PerformanceTable } from "../PerformanceTable";
import { s } from "./styles";

export function AgentPerformanceView({ period, onPeriod }: { period: PeriodParams; onPeriod: (p: PeriodParams) => void }) {
  const t = useTranslations("agentPerformance");
  const { data, isLoading, isError, refetch } = useAgentPerformance(period);

  const crumb = [{ label: t("crumb") }];
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

    const { totals, most_active: active } = data;
    if (totals.runs === 0) {
      return (
        <div>
          <div style={s.emptyTitle}>{t("empty.title")}</div>
          <div style={s.note}>{t("empty.body")}</div>
        </div>
      );
    }

    return (
      <>
        <div style={s.cards}>
          <KpiCard label={t("kpi.totalRuns")} value={String(totals.runs)} caption={cap} />
          <KpiCard
            label={t("kpi.totalCost")}
            value={totals.total_cost_usd === null ? null : formatUsd(totals.total_cost_usd)}
            caption={
              <>
                <span style={s.line}>{cap}</span>
                <span style={s.line}>{t("kpi.priced", { priced: totals.priced_runs, runs: totals.runs })}</span>
              </>
            }
            badge={<Badge style={s.costBadge}>{t("costBadge")}</Badge>}
          />
          <KpiCard
            label={t("kpi.avgAcceptRate")}
            value={totals.accept_rate === null ? null : formatRate(totals.accept_rate)}
            caption={
              <>
                <span style={s.line}>{cap}</span>
                <span style={s.line}>{t("kpi.decided", { accepted: totals.accepted, decided: totals.decided })}</span>
                <span style={s.line}>{t("acceptLocalOnly")}</span>
              </>
            }
          />
          <KpiCard
            label={t("kpi.mostActive")}
            value={active ? active.agent_name : null}
            caption={
              <>
                <span style={s.line}>{cap}</span>
                {active && <span style={s.line}>{t("kpi.mostActiveRuns", { runs: active.runs })}</span>}
              </>
            }
          />
        </div>
        <section aria-label={t("title")} style={s.section}>
          <PerformanceTable rows={data.rows} period={period} />
        </section>
        <CostBreakdown byAgent={data.by_agent} byModel={data.by_model} total={totals.total_cost_usd} />
      </>
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.head}>
          <h1 style={s.title}>{t("title")}</h1>
          <PeriodSelector value={period} onChange={onPeriod} />
        </div>
        {body()}
      </div>
    </AppShell>
  );
}
