/* MultiRunView — /multi-agent/:id. Polls via useMultiRun; a failed refetch keeps the last data and
   shows a non-blocking notice. PR titles and agent names are rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatCost, formatDuration } from "@/components/multi-agent";
import { useMultiRun } from "@/lib/hooks/multi-agent";
import { AgentColumns } from "../AgentColumns";
import { FindingGroups } from "../FindingGroups";
import { DisagreementsSection } from "../DisagreementsSection";
import { STATUS_COLORS, formatTokens } from "./helpers";
import { s } from "./styles";

export function MultiRunView({ id }: { id: string }) {
  const t = useTranslations("multiAgent");
  const { data, isLoading, isError, refetch } = useMultiRun(id);
  const dash = t("picker.dash");
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumb"), href: "/multi-agent" },
    { label: data ? `#${data.pr.number}` : t("page.runFallback") },
  ];

  if (!data) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.wrap}>
          {isError ? (
            <ErrorState
              title={t("page.loadErrorTitle")}
              body={t("page.loadErrorBody")}
              onRetry={() => refetch()}
            />
          ) : (
            <div>
              <div style={s.note}>{t("page.loading")}</div>
              {isLoading && <Skeleton height={80} />}
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  const colors = STATUS_COLORS[data.status];
  const names = data.agents.map((a) => a.agent_name ?? t("column.deletedAgent")).join(", ");

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.head}>
          <div style={s.titleRow}>
            <h1 style={s.title}>{`#${data.pr.number} ${data.pr.title}`}</h1>
            <Badge color={colors.color} bg={colors.bg}>
              {t(`page.status.${data.status}`)}
            </Badge>
          </div>
          <div style={s.agents}>
            {t("page.agents")}: {names}
          </div>
          <div style={s.stats}>
            <span>
              {t("page.wallClock")}
              <span className="tnum" style={s.statValue}>{formatDuration(data.wall_clock_ms, dash)}</span>
            </span>
            <span>
              {t("page.tokens")}
              <span className="tnum" style={s.statValue}>{formatTokens(data.tokens_in, data.tokens_out)}</span>
            </span>
            <span>
              {t("page.cost")}
              <span className="tnum" style={s.statValue}>{formatCost(data.cost_usd, dash)}</span>
            </span>
          </div>
        </div>
        {isError && <div style={s.notice}>{t("page.refreshNotice")}</div>}
        <section>
          <h2 style={s.sectionTitle}>{t("column.title")}</h2>
          <AgentColumns
            agents={data.agents}
            prNumber={data.pr.number}
            findings={data.groups.flatMap((g) => g.members)}
          />
        </section>
        <section>
          <h2 style={s.sectionTitle}>{t("groups.title")}</h2>
          <FindingGroups groups={data.groups} agents={data.agents} multiRunId={data.id} />
        </section>
        <section>
          <h2 style={s.sectionTitle}>{t("disagree.title")}</h2>
          <DisagreementsSection groups={data.groups} agents={data.agents} />
        </section>
      </div>
    </AppShell>
  );
}
