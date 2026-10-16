/* EvalCaseRow — one case of the Evals tab: Run, Edit and Delete (AC-49, AC-51). The single-run
   result shows inline under the row; Edit swaps the row for a name + zone form (file and type stay
   read-only). Presentational: the tab owns the calls and the per-row state. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, TextInput } from "@devdigest/ui";
import type { EvalCaseEdit, EvalCaseRow as EvalCaseRowData, EvalSingleRun } from "@devdigest/shared";
import { EvalSingleRunResult } from "@/components/eval/EvalSingleRunResult";
import { validateEdit } from "@/components/eval/EvalCaseModal";
import { caseLocation } from "../../helpers";
import { CASE_STATUS_COLORS, s } from "./styles";

export interface EvalCaseRowProps {
  item: EvalCaseRowData;
  running: boolean;
  result?: EvalSingleRun | null;
  /** Message for a failed Run. */
  runError?: string | null;
  editing: boolean;
  saving: boolean;
  /** Server message for a refused Edit save. */
  editError?: string | null;
  onRun: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (edit: EvalCaseEdit) => void;
  onDelete: () => void;
}

function EditForm({
  item,
  saving,
  error,
  onCancel,
  onSave,
}: {
  item: EvalCaseRowData;
  saving: boolean;
  error?: string | null;
  onCancel: () => void;
  onSave: (edit: EvalCaseEdit) => void;
}) {
  const t = useTranslations("eval");
  const [name, setName] = React.useState(item.name);
  const [start, setStart] = React.useState(String(item.expectation.start_line));
  const [end, setEnd] = React.useState(String(item.expectation.end_line));
  const checked = validateEdit(name, start, end);
  const reason = error ?? (checked.error ? t(`caseModal.validation.${checked.error}`) : null);
  return (
    <div style={s.below}>
      <div style={s.form}>
        <div style={s.nameField}>
          <div style={s.fieldLabel}>{t("evalsTab.nameLabel")}</div>
          <TextInput aria-label={t("evalsTab.nameLabel")} value={name} onChange={setName} />
        </div>
        <div style={s.lineField}>
          <div style={s.fieldLabel}>{t("evalsTab.startLabel")}</div>
          <TextInput aria-label={t("evalsTab.startLabel")} mono inputMode="numeric" value={start} onChange={setStart} />
        </div>
        <div style={s.lineField}>
          <div style={s.fieldLabel}>{t("evalsTab.endLabel")}</div>
          <TextInput aria-label={t("evalsTab.endLabel")} mono inputMode="numeric" value={end} onChange={setEnd} />
        </div>
        <Button kind="ghost" size="sm" onClick={onCancel}>
          {t("evalsTab.cancel")}
        </Button>
        <Button
          kind="primary"
          size="sm"
          icon="Check"
          disabled={!!checked.error || saving}
          onClick={() => checked.edit && onSave(checked.edit)}
        >
          {t(saving ? "evalsTab.saving" : "evalsTab.save")}
        </Button>
      </div>
      {reason && (
        <div role="alert" style={s.error}>
          {reason}
        </div>
      )}
    </div>
  );
}

export function EvalCaseRow({
  item,
  running,
  result,
  runError,
  editing,
  saving,
  editError,
  onRun,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: EvalCaseRowProps) {
  const t = useTranslations("eval");
  const color = CASE_STATUS_COLORS[item.latest_status];
  return (
    <div style={s.row}>
      <div style={s.main}>
        <span style={s.name}>{item.name}</span>
        <Badge>{t(item.expectation.type === "must_find" ? "type.mustFind" : "type.mustNotFlag")}</Badge>
        <span className="mono" style={s.location}>
          {caseLocation(item.expectation)}
        </span>
        <Badge color={color.color} bg={color.bg}>
          {t(item.latest_status === "never_run" ? "status.neverRun" : `status.${item.latest_status}`)}
        </Badge>
        <Button kind="ghost" size="sm" icon="Play" disabled={running} onClick={onRun}>
          {t(running ? "evalsTab.running" : "evalsTab.run")}
        </Button>
        <Button kind="ghost" size="sm" icon="Edit" disabled={editing} onClick={onStartEdit}>
          {t("evalsTab.edit")}
        </Button>
        <Button kind="ghost" size="sm" icon="Trash" onClick={onDelete}>
          {t("evalsTab.delete")}
        </Button>
      </div>
      {editing && (
        <EditForm item={item} saving={saving} error={editError} onCancel={onCancelEdit} onSave={onSaveEdit} />
      )}
      {result && (
        <div style={s.below} role="status">
          <EvalSingleRunResult result={result} expectationType={item.expectation.type} />
        </div>
      )}
      {runError && (
        <div role="alert" style={s.error}>
          {runError}
        </div>
      )}
    </div>
  );
}
