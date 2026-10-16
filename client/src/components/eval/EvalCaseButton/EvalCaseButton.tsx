/* EvalCaseButton — "Turn into eval case" beside Accept / Dismiss on a finding card.
   Enabled only once the finding is decided (accepted or dismissed). Click loads the draft
   (no model call, nothing stored) and opens EvalCaseModal; Save creates the case (AC-46..AC-48). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { EvalCaseCreated, EvalCaseEdit, EvalSingleRun, FindingRecord } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useLoadEvalCaseDraft,
  useRunDraftCase,
} from "../../../lib/hooks/evals";
import { notify } from "../../../lib/toast";
import { ApiError } from "../../../lib/api";
import { EvalCaseModal, type EvalCaseModalDraft } from "../EvalCaseModal";
import { conflictName, errorKey, isRefusal } from "./helpers";

const HINT_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
};

type ModalState = { draft: EvalCaseModalDraft | null; refusal: string | null };

export function EvalCaseButton({ finding }: { finding: FindingRecord }) {
  const t = useTranslations("eval");
  const loadDraft = useLoadEvalCaseDraft();
  const create = useCreateEvalCase();
  const runDraft = useRunDraftCase();
  const [modal, setModal] = React.useState<ModalState | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<EvalSingleRun | null>(null);
  const decided = !!finding.accepted_at || !!finding.dismissed_at;
  const hintId = `eval-case-hint-${finding.id}`;
  const hint = t("turnInto.errors.eval_case_undecided");

  const message = (err: unknown, fallback: "generic" | "runGeneric") => {
    const code = err instanceof ApiError ? err.code : undefined;
    return t(`turnInto.errors.${errorKey(code, fallback)}`, { name: conflictName(err) ?? "" });
  };

  const toast = (res: EvalCaseCreated) =>
    notify.success(
      <span>
        {t(res.created ? "turnInto.success" : "turnInto.exists", { agent: res.agent_name })}{" "}
        <Link href={`/agents/${res.agent_id}?tab=evals`} style={{ textDecoration: "underline" }}>
          {t("turnInto.view")}
        </Link>
      </span>,
    );

  const close = () => {
    setModal(null);
    setError(null);
    setResult(null);
  };

  const open = () =>
    loadDraft.mutate(finding.id, {
      onSuccess: (res) => {
        if (res.existing) {
          toast({ ...res.existing, created: false });
        } else if (res.draft) {
          setError(null);
          setResult(null);
          setModal({ draft: res.draft, refusal: null });
        } else {
          notify.error(t("turnInto.errors.generic"));
        }
      },
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : undefined;
        if (isRefusal(code)) setModal({ draft: null, refusal: message(err, "generic") });
        else notify.error(message(err, "generic"));
      },
    });

  const save = (edit: EvalCaseEdit) => {
    setError(null);
    create.mutate(
      { findingId: finding.id, edit },
      {
        onSuccess: (res) => {
          close();
          toast(res);
        },
        onError: (err) => setError(message(err, "generic")),
      },
    );
  };

  const run = (edit: EvalCaseEdit) => {
    setError(null);
    setResult(null);
    runDraft.mutate(
      { findingId: finding.id, edit },
      { onSuccess: setResult, onError: (err) => setError(message(err, "runGeneric")) },
    );
  };

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || loadDraft.isPending}
        title={decided ? undefined : hint}
        aria-describedby={decided ? undefined : hintId}
        onClick={open}
      >
        {t("turnInto.label")}
      </Button>
      {!decided && (
        <span id={hintId} style={HINT_STYLE}>
          {hint}
        </span>
      )}
      {modal && (
        <EvalCaseModal
          draft={modal.draft}
          refusal={modal.refusal}
          error={error}
          result={result}
          saving={create.isPending}
          running={runDraft.isPending}
          onSave={save}
          onRun={run}
          onCancel={close}
          onEdit={() => {
            setError(null);
            setResult(null);
          }}
        />
      )}
    </>
  );
}
