/* EvalCaseModal — "Turn into eval case" (AC-46..AC-48). Props-driven: the caller owns the network
   calls, the server's inline message and the last run's result. Opening it makes no call. With a
   `refusal` (draft null) it shows that reason and Run case / Save stay disabled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { EvalCaseDraft, EvalCaseEdit, EvalSingleRun } from "@devdigest/shared";
import { EvalSingleRunResult } from "../EvalSingleRunResult";
import { diffFragment, parseLine, validateEdit } from "./helpers";
import { diffLine, s } from "./styles";

export type EvalCaseModalDraft = NonNullable<EvalCaseDraft["draft"]>;

export interface EvalCaseModalProps {
  draft: EvalCaseModalDraft | null;
  /** Why the finding cannot become a case (AC-46); shown instead of the form. */
  refusal?: string | null;
  /** The server's message for the last Save / Run that failed. */
  error?: string | null;
  result?: EvalSingleRun | null;
  saving?: boolean;
  running?: boolean;
  onSave: (edit: EvalCaseEdit) => void;
  onRun: (edit: EvalCaseEdit) => void;
  onCancel: () => void;
  /** Any field edit: the caller drops a stale error / result. */
  onEdit?: () => void;
}

export function EvalCaseModal({
  draft,
  refusal,
  error,
  result,
  saving,
  running,
  onSave,
  onRun,
  onCancel,
  onEdit,
}: EvalCaseModalProps) {
  const t = useTranslations("eval");
  const [name, setName] = React.useState(draft?.name ?? "");
  const [start, setStart] = React.useState(String(draft?.expectation.start_line ?? ""));
  const [end, setEnd] = React.useState(String(draft?.expectation.end_line ?? ""));

  const checked = validateEdit(name, start, end);
  const a = parseLine(start);
  const b = parseLine(end);
  const zoneOk = a !== null && b !== null && a >= 1 && a <= b;
  const zs = zoneOk ? a : null;
  const ze = zoneOk ? b : null;
  const fragment = React.useMemo(
    () => (draft ? diffFragment(draft.input_diff, zs !== null && ze !== null ? { start: zs, end: ze } : null) : []),
    [draft, zs, ze],
  );

  const busy = !!saving || !!running;
  const blocked = !draft || checked.error !== null || busy;
  const reason = refusal ?? (checked.error ? t(`caseModal.validation.${checked.error}`) : null);
  const change = (set: (v: string) => void) => (v: string) => {
    set(v);
    onEdit?.();
  };

  const footer = (
    <div style={s.footer}>
      <Button kind="ghost" onClick={onCancel}>
        {t("caseModal.cancel")}
      </Button>
      <Button
        kind="secondary"
        icon="Play"
        disabled={blocked}
        onClick={() => checked.edit && onRun(checked.edit)}
      >
        {t(running ? "caseModal.running" : "caseModal.runCase")}
      </Button>
      <Button
        kind="primary"
        icon="Check"
        disabled={blocked}
        onClick={() => checked.edit && onSave(checked.edit)}
      >
        {t(saving ? "caseModal.saving" : "caseModal.save")}
      </Button>
    </div>
  );

  if (!draft) {
    return (
      <Modal
        width={920}
        title={t("turnInto.label")}
        subtitle={t("caseModal.subtitleRefused")}
        onClose={onCancel}
        footer={footer}
      >
        <div role="alert" style={s.refusal}>
          {refusal}
        </div>
      </Modal>
    );
  }

  const exp = draft.expectation;
  const positive = exp.type === "must_find";

  return (
    <Modal
      width={920}
      title={t("caseModal.title", { name: draft.name })}
      subtitle={t(positive ? "caseModal.subtitleFind" : "caseModal.subtitleNotFlag")}
      onClose={onCancel}
      footer={footer}
    >
      <div style={s.grid}>
        <div style={s.col}>
          <FormField label={t("caseModal.nameLabel")}>
            <TextInput
              aria-label={t("caseModal.nameLabel")}
              value={name}
              onChange={change(setName)}
              disabled={busy}
            />
          </FormField>
          <div style={s.label}>{t("caseModal.diffLabel")}</div>
          <pre className="mono" style={s.diff} data-testid="diff-fragment">
            {fragment.length === 0 ? (
              <span style={s.diffEmpty}>{t("caseModal.noHunk")}</span>
            ) : (
              fragment.map((l, i) => (
                <span key={i} style={diffLine(l)} data-highlighted={l.highlighted ? "true" : undefined}>
                  {l.text || " "}
                </span>
              ))
            )}
          </pre>
        </div>

        <div style={s.col}>
          <div style={s.label}>{t("caseModal.expectationLabel")}</div>
          <div style={s.readonlyRow}>
            <span style={s.readonlyKey}>{t("caseModal.typeLabel")}</span>
            <Badge>{t(positive ? "caseModal.typePositive" : "caseModal.typeNegative")}</Badge>
          </div>
          <div style={s.readonlyRow}>
            <span style={s.readonlyKey}>{t("caseModal.fileLabel")}</span>
            <span className="mono" style={s.file}>
              {exp.file}
            </span>
          </div>
          <div style={s.lines}>
            <div style={s.lineField}>
              <div style={s.lineLabel}>{t("caseModal.startLabel")}</div>
              <TextInput
                aria-label={t("caseModal.startLabel")}
                mono
                inputMode="numeric"
                value={start}
                onChange={change(setStart)}
                disabled={busy}
              />
            </div>
            <div style={s.lineField}>
              <div style={s.lineLabel}>{t("caseModal.endLabel")}</div>
              <TextInput
                aria-label={t("caseModal.endLabel")}
                mono
                inputMode="numeric"
                value={end}
                onChange={change(setEnd)}
                disabled={busy}
              />
            </div>
          </div>

          <div style={s.label}>{t("caseModal.resultLabel")}</div>
          {result ? (
            <EvalSingleRunResult result={result} expectationType={exp.type} />
          ) : (
            <div style={s.muted}>{t("caseModal.noResult")}</div>
          )}
          {(reason || error) && (
            <div role="alert" style={s.error}>
              {error ?? reason}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
