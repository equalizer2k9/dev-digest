/* MultiRunListView — /multi-agent. Up to 20 newest runs, each row links to its run page.
   PR titles and agent names are rendered as text nodes only. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { formatDuration } from "@/components/multi-agent";
import { formatCost } from "@/lib/cost";
import { useMultiRuns } from "@/lib/hooks/multi-agent";
import { NewMultiRunDialog } from "../NewMultiRunDialog";
import { s } from "./styles";

const STATUS_COLORS = {
  running: "var(--info)",
  done: "var(--success)",
  failed: "var(--danger)",
} as const;

export function MultiRunListView() {
  const t = useTranslations("multiAgent");
  const { data, isLoading, isError, refetch } = useMultiRuns();
  const [dialog, setDialog] = React.useState(false);
  const dash = t("picker.dash");

  const body = () => {
    if (isLoading) {
      return (
        <div>
          <div style={s.note}>{t("list.loading")}</div>
          <Skeleton height={80} />
        </div>
      );
    }
    if (isError || !data) {
      return (
        <ErrorState title={t("list.loadErrorTitle")} body={t("list.loadErrorBody")} onRetry={() => refetch()} />
      );
    }
    if (data.length === 0) {
      return (
        <EmptyState
          icon="Layers"
          title={t("list.emptyTitle")}
          body={t("list.emptyBody")}
          cta={t("list.emptyCta")}
          onCta={() => setDialog(true)}
        />
      );
    }
    return (
      <table style={s.table}>
        <thead>
          <tr>
            <th style={s.th}>{t("list.table.pullRequest")}</th>
            <th style={s.th}>{t("list.table.agents")}</th>
            <th style={s.th}>{t("list.table.status")}</th>
            <th style={s.th}>{t("list.table.wallClock")}</th>
            <th style={s.th}>{t("list.table.cost")}</th>
            <th style={s.th}>{t("list.table.started")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id}>
              <td style={s.td}>
                <Link href={`/multi-agent/${r.id}`} style={s.link}>
                  {`#${r.pr.number} ${r.pr.title}`}
                </Link>
              </td>
              <td style={s.td}>
                {r.agents.map((a) => a.agent_name ?? t("column.deletedAgent")).join(", ")}
              </td>
              <td style={s.td}>
                <Badge color={STATUS_COLORS[r.status]}>{t(`page.status.${r.status}`)}</Badge>
              </td>
              <td className="tnum" style={s.td}>{formatDuration(r.wall_clock_ms, dash)}</td>
              <td className="tnum" style={s.td}>{formatCost(r.cost_usd, dash)}</td>
              <td className="tnum" style={s.td}>{new Date(r.started_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.wrap}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("list.title")}</h1>
            <div style={s.subtitle}>{t("list.subtitle")}</div>
          </div>
          <Button kind="primary" icon="Plus" onClick={() => setDialog(true)}>
            {t("list.new")}
          </Button>
        </div>
        {body()}
      </div>
      {dialog && <NewMultiRunDialog onClose={() => setDialog(false)} />}
    </AppShell>
  );
}
