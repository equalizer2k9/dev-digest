/* EvalDashboardView — /eval. The agents that have an eval set (a disabled agent included)
   with their latest completed run, and the newest runs across agents. Renders the one
   dashboard payload only; a click on an agent opens its Evals tab. */
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatMetric, formatPassed } from "@/components/eval/EvalMetrics";
import { EvalRunTable } from "@/components/eval/EvalRunTable";
import { useEvalDashboard } from "@/lib/hooks/evals";
import { s } from "./styles";

export function EvalDashboardView() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useEvalDashboard();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];
  const metric = (v: number | null) => formatMetric(v) ?? <span style={s.muted}>{t("na")}</span>;
  const open = (agentId: string) => router.push(`/agents/${agentId}?tab=evals`);

  const body = () => {
    if (isLoading) {
      return (
        <div>
          <div style={s.note}>{t("dashboard.loading")}</div>
          <Skeleton height={80} />
        </div>
      );
    }
    if (isError || !data) return <ErrorState title={t("loadError")} onRetry={() => refetch()} />;

    return (
      <>
        <section aria-label={t("dashboard.agentsTitle")} style={s.section}>
          <h2 style={s.h2}>{t("dashboard.agentsTitle")}</h2>
          {data.agents.length === 0 ? (
            <div style={s.note}>{t("dashboard.empty")}</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{t("dashboard.table.agent")}</th>
                  <th style={s.th}>{t("dashboard.table.cases")}</th>
                  <th style={s.th}>{t("dashboard.table.version")}</th>
                  <th style={s.th}>{t("dashboard.table.recall")}</th>
                  <th style={s.th}>{t("dashboard.table.precision")}</th>
                  <th style={s.th}>{t("dashboard.table.citation")}</th>
                  <th style={s.th}>{t("dashboard.table.pass")}</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((a) => {
                  const latest = a.latest?.status === "completed" ? a.latest : null;
                  return (
                    <tr key={a.agent_id} style={s.row} onClick={() => open(a.agent_id)}>
                      <td style={s.td}>
                        <button type="button" style={s.nameBtn}>
                          {a.name}
                        </button>{" "}
                        {!a.enabled && <Badge color="var(--text-muted)">{t("dashboard.disabled")}</Badge>}
                      </td>
                      <td className="tnum" style={s.td}>
                        {a.cases_total}
                      </td>
                      {latest ? (
                        <>
                          <td className="tnum" style={s.td}>{`v${latest.agent_version}`}</td>
                          <td className="tnum" style={s.td}>{metric(latest.recall)}</td>
                          <td className="tnum" style={s.td}>{metric(latest.precision)}</td>
                          <td className="tnum" style={s.td}>{metric(latest.citation_accuracy)}</td>
                          <td className="tnum" style={s.td}>{formatPassed(latest.passed, latest.total)}</td>
                        </>
                      ) : (
                        <td colSpan={5} style={{ ...s.td, ...s.muted }}>
                          {t("evalsTab.neverRun")}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section aria-label={t("dashboard.recentRuns")} style={s.section}>
          <h2 style={s.h2}>{t("dashboard.recentRuns")}</h2>
          {data.recent_runs.length === 0 ? (
            <div style={s.note}>{t("dashboard.noRuns")}</div>
          ) : (
            <EvalRunTable runs={data.recent_runs} showAgent />
          )}
        </section>
      </>
    );
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <h1 style={s.title}>{t("dashboard.defaultTitle")}</h1>
        {body()}
      </div>
    </AppShell>
  );
}
