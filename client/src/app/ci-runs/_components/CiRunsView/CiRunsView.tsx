/* CiRunsView — /ci-runs. Opening the page ingests new CI results once; Refresh ingests again.
   A failed ingest never hides the stored rows: it shows a plain-text notice above the table. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { CiRunsTable } from "@/components/ci/CiRunsTable";
import { useCiRuns, useRefreshCiRuns } from "@/lib/hooks/ci";
import { s } from "./styles";

export function CiRunsView() {
  const t = useTranslations("ci");
  const { data, isLoading, isError, refetch } = useCiRuns();
  const refresh = useRefreshCiRuns();

  // One ingest per page open: the ref survives StrictMode's second effect run.
  const ingested = React.useRef(false);
  React.useEffect(() => {
    if (ingested.current) return;
    ingested.current = true;
    refresh.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ingestError = refresh.data?.error ?? (refresh.error ? refresh.error.message : null);
  const runs = data?.runs ?? [];

  const body = () => {
    if (isLoading) {
      return (
        <div>
          <div style={s.note}>{t("runs.loading")}</div>
          <Skeleton height={80} />
        </div>
      );
    }
    if (isError || !data) return <ErrorState title={t("runs.loadError")} onRetry={() => refetch()} />;
    if (runs.length === 0) {
      return (
        <div style={s.note}>
          <div style={s.emptyTitle}>{t("runs.emptyTitle")}</div>
          <div>{t("runs.emptyBody")}</div>
        </div>
      );
    }
    return <CiRunsTable runs={runs} />;
  };

  return (
    <AppShell crumb={[{ label: t("page.crumb") }]}>
      <div style={s.wrap}>
        <div style={s.head}>
          <div>
            <h1 style={s.title}>{t("runs.title")}</h1>
            <div style={s.subtitle}>{t("runs.subtitle")}</div>
          </div>
          <Button kind="secondary" icon="RefreshCw" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
            {refresh.isPending ? t("runs.refreshing") : t("runs.refresh")}
          </Button>
        </div>
        {ingestError && <div style={s.notice}>{t("runs.ingestError", { message: ingestError })}</div>}
        {body()}
      </div>
    </AppShell>
  );
}
