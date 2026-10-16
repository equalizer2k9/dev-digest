/* EvalsTab — an agent's eval cases, the "Run eval" action and the live status of its newest
   run. Reads one overview query (polled while a run is running); delete is pessimistic. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseEdit, EvalCaseRow, EvalSingleRun } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog/ConfirmDialog";
import { ApiError } from "../../../../../../../lib/api";
import {
  useDeleteEvalCase,
  useEvalOverview,
  useRunEval,
  useRunEvalCase,
  useUpdateEvalCase,
} from "../../../../../../../lib/hooks/evals";
import { EvalMetrics } from "../../../../../../../components/eval/EvalMetrics";
import { EvalRunTable } from "../../../../../../../components/eval/EvalRunTable";
import { conflictName, errorKey } from "../../../../../../../components/eval/EvalCaseButton/helpers";
import { EvalCaseRow as CaseRow } from "./_components/EvalCaseRow";
import { latestCompleted, statusLineRun } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const { data, isLoading, isError, refetch } = useEvalOverview(agent.id);
  const runEval = useRunEval(agent.id);
  const deleteCase = useDeleteEvalCase(agent.id);
  const runCase = useRunEvalCase(agent.id);
  const updateCase = useUpdateEvalCase(agent.id);
  const [pendingDelete, setPendingDelete] = React.useState<EvalCaseRow | null>(null);
  const [runError, setRunError] = React.useState<"runFailed" | "runInProgress" | null>(null);
  const [deleteError, setDeleteError] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  // Single-case runs (AC-49) are per row and live only here: they are not runs, so nothing is refetched.
  const [runningIds, setRunningIds] = React.useState<string[]>([]);
  const [results, setResults] = React.useState<Record<string, EvalSingleRun>>({});
  const [runErrors, setRunErrors] = React.useState<Record<string, string>>({});
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editError, setEditError] = React.useState<string | null>(null);
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
    setRunError(null);
    runEval.mutate(undefined, {
      onError: (err) => {
        // Another tab started a run first (AC-13): say so and fetch it so its status line shows.
        if (err instanceof ApiError && err.code === "eval_run_in_progress") {
          setRunError("runInProgress");
          void refetch();
        } else setRunError("runFailed");
      },
    });
  };

  const runOne = async (id: string) => {
    setRunningIds((ids) => [...ids, id]);
    setRunErrors(({ [id]: _drop, ...rest }) => rest);
    setResults(({ [id]: _drop, ...rest }) => rest);
    try {
      const res = await runCase.mutateAsync(id);
      setResults((r) => ({ ...r, [id]: res }));
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      const msg = t(`turnInto.errors.${errorKey(code, "runGeneric")}`, { name: conflictName(err) ?? "" });
      setRunErrors((r) => ({ ...r, [id]: msg }));
    } finally {
      setRunningIds((ids) => ids.filter((x) => x !== id));
    }
  };

  const saveEdit = (id: string, edit: EvalCaseEdit) => {
    setEditError(null);
    updateCase.mutate(
      { caseId: id, edit },
      {
        onSuccess: () => {
          setEditingId(null);
          // The old result was for the old zone.
          setResults(({ [id]: _drop, ...rest }) => rest);
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : undefined;
          setEditError(t(`turnInto.errors.${errorKey(code, "updateGeneric")}`, { name: conflictName(err) ?? "" }));
        },
      },
    );
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
      <div style={s.dashboardLink}>
        <Link href="/eval" style={s.link}>
          {t("evalsTab.viewDashboard")}
        </Link>
      </div>
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
      {runError && <div style={s.inlineError}>{t(runError)}</div>}
      {deleteError && <div style={s.inlineError}>{t("deleteFailed")}</div>}

      {cases.length === 0 ? (
        <div style={s.empty}>{t("evalsTab.emptyCases")}</div>
      ) : (
        cases.map((c) => (
          <CaseRow
            key={c.id}
            item={c}
            running={runningIds.includes(c.id)}
            result={results[c.id]}
            runError={runErrors[c.id]}
            editing={editingId === c.id}
            saving={updateCase.isPending}
            editError={editingId === c.id ? editError : null}
            onRun={() => void runOne(c.id)}
            onStartEdit={() => {
              setEditError(null);
              setEditingId(c.id);
            }}
            onCancelEdit={() => setEditingId(null)}
            onSaveEdit={(edit) => saveEdit(c.id, edit)}
            onDelete={() => setPendingDelete(c)}
          />
        ))
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
