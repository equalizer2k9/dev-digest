/* EvalsTab — an agent's eval cases, the "Run eval" action and the live status of its newest
   run. Reads one overview query (polled while a run is running); delete is pessimistic. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseRow } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog/ConfirmDialog";
import { useDeleteEvalCase, useEvalOverview, useRunEval } from "../../../../../../../lib/hooks/evals";
import { EvalMetrics } from "../../../../../../../components/eval/EvalMetrics";
import { EvalRunTable } from "../../../../../../../components/eval/EvalRunTable";
import { caseLocation, latestCompleted, statusLineRun } from "./helpers";
import { CASE_STATUS_COLORS, s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalOverview(agent.id);
  const runEval = useRunEval(agent.id);
  const deleteCase = useDeleteEvalCase(agent.id);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCaseRow | null>(null);
  const [runError, setRunError] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const router = useRouter();

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <div style={s.empty}>{t("evalsTab.loadingCases")}</div>
        <Skeleton height={40} />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div style={s.wrap}>
        <ErrorState title={t("loadError")} onRetry={() => refetch()} />
      </div>
    );
  }

  const { cases, runs } = data;
  const running = runs.some((r) => r.status === "running");
  const line = statusLineRun(runs);
  const latest = latestCompleted(runs);
  // Derived, not effect-synced: a picked run that left the list (or is no longer completed) drops out.
  const selected = picked.filter((id) => runs.some((r) => r.id === id && r.status === "completed"));
  const toggle = (id: string) =>
    setPicked(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const compare = () => {
    // Earlier run first: `runs` is newest first, so the older one has the higher index.
    const [a, b] = runs.filter((r) => selected.includes(r.id)).reverse();
    if (a && b) router.push(`/eval/compare?a=${a.id}&b=${b.id}`);
  };

  const start = () => {
    setRunError(false);
    runEval.mutate(undefined, { onError: () => setRunError(true) });
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setDeleteError(false);
    setPendingDelete(null);
    deleteCase.mutate(id, { onError: () => setDeleteError(true) });
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.casesHeading")}</h2>
        <Button
          kind="primary"
          size="sm"
          icon="Play"
          disabled={cases.length === 0 || running || runEval.isPending}
          onClick={start}
        >
          {t("dashboard.runEval", { count: cases.length })}
        </Button>
      </div>

      {/* The live region stays mounted so a status change is announced. */}
      <div role="status" aria-live="polite">
        {line && (
          <div style={s.statusLine(line.status === "failed")}>
            {line.status === "running"
              ? t("statusLine.running", { count: line.total })
              : t("statusLine.failed", { error: line.error ?? "" })}
          </div>
        )}
      </div>
      {runError && <div style={s.inlineError}>{t("runFailed")}</div>}
      {deleteError && <div style={s.inlineError}>{t("deleteFailed")}</div>}

      {cases.length === 0 ? (
        <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
      ) : (
        cases.map((c) => {
          const color = CASE_STATUS_COLORS[c.latest_status];
          return (
            <div key={c.id} style={s.row}>
              <span style={s.name}>{c.name}</span>
              <Badge>{t(c.expectation.type === "must_find" ? "type.mustFind" : "type.mustNotFlag")}</Badge>
              <span className="mono" style={s.location}>
                {caseLocation(c.expectation)}
              </span>
              <Badge color={color.color} bg={color.bg}>
                {t(c.latest_status === "never_run" ? "status.neverRun" : `status.${c.latest_status}`)}
              </Badge>
              <Button kind="ghost" size="sm" icon="Trash" onClick={() => setPendingDelete(c)}>
                {t("evalsTab.delete")}
              </Button>
            </div>
          );
        })
      )}

      {latest && (
        <section style={s.section}>
          <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
          <EvalMetrics run={latest} />
        </section>
      )}

      <section style={s.section}>
        <div style={s.header}>
          <h2 style={s.h2}>{t("history.title")}</h2>
          <Button kind="secondary" size="sm" disabled={selected.length !== 2} onClick={compare}>
            {t("history.compareSelected")}
          </Button>
        </div>
        {runs.length === 0 ? (
          <div style={s.empty}>{t("history.empty")}</div>
        ) : (
          <EvalRunTable runs={runs} selectable selected={selected} onToggle={toggle} />
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title={t("deleteConfirm.title")}
          body={t("deleteConfirm.body", { name: pendingDelete.name })}
          confirmLabel={t("deleteConfirm.confirm")}
          cancelLabel={t("deleteConfirm.cancel")}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
