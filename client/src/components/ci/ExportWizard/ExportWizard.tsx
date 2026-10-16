/* ExportWizard — Target → Preview → Configure → Install for adding an agent to CI. GitHub
   Actions only. The preview is the exact commit: only the workflow is editable, the rest is
   read-only text. Everything from the server is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Checkbox, ExportWizardSteps, IconBtn, Textarea } from "@devdigest/ui";
import type { Agent, CiFile, CiPostAs, CiTrigger } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useRepos } from "@/lib/hooks/core";
import { useInstallCi, usePreviewCi } from "@/lib/hooks/ci";
import {
  DEFAULT_POST_AS,
  DEFAULT_TRIGGERS,
  ERR_RUNNER_MISSING,
  POST_AS_KEYS,
  RUNNER_PREFIX,
  STEP_CONFIGURE,
  STEP_INSTALL,
  STEP_KEYS,
  STEP_PREVIEW,
  STEP_TARGET,
  TRIGGERS,
} from "./constants";
import { canContinue, installBody, previewBody, type WizardState } from "./helpers";
import { s } from "./styles";

export interface ExportWizardProps {
  agent: Agent;
  onClose: () => void;
  /** Gallery only: start on a step with a ready preview, without any request. */
  initial?: { step: number; repoId: string; files: CiFile[] };
}

export function ExportWizard({ agent, onClose, initial }: ExportWizardProps) {
  const t = useTranslations("ci");
  const { data: repos = [] } = useRepos();
  const preview = usePreviewCi(agent.id);
  const install = useInstallCi(agent.id);

  const [step, setStep] = React.useState(initial?.step ?? STEP_TARGET);
  const [repoId, setRepoId] = React.useState<string | null>(initial?.repoId ?? null);
  const [triggers, setTriggers] = React.useState<CiTrigger[]>([...DEFAULT_TRIGGERS]);
  const [postAs, setPostAs] = React.useState<CiPostAs>(DEFAULT_POST_AS);
  const [edited, setEdited] = React.useState<string | null>(null);

  const files = preview.data?.files ?? initial?.files ?? [];
  const workflow = files.find((f) => f.editable);
  const state: WizardState = {
    repoId,
    triggers,
    postAs,
    fileCount: files.length,
    previewFailed: !!preview.error,
    editedWorkflow: edited,
  };
  const ok = canContinue(step, state);

  const requestPreview = () => {
    setEdited(null);
    preview.mutate(previewBody(state));
  };
  const next = () => {
    if (step === STEP_TARGET) requestPreview();
    setStep(step + 1);
  };
  const toggleTrigger = (tr: CiTrigger) =>
    setTriggers(triggers.includes(tr) ? triggers.filter((x) => x !== tr) : [...triggers, tr]);
  const editWorkflow = (text: string) => setEdited(workflow && text === workflow.contents ? null : text);

  const previewError = preview.error;
  const runnerMissing = previewError instanceof ApiError && previewError.code === ERR_RUNNER_MISSING;

  const renderBody = () => {
    if (step === STEP_TARGET) {
      return (
        <>
          <div style={s.card}>
            <div style={s.cardTitle}>{t("exportWizard.targets.gha")}</div>
            <div style={s.muted}>{t("exportWizard.targets.ghaDesc")}</div>
          </div>
          <div style={s.muted}>{t("exportWizard.onlyGha")}</div>
          <div role="radiogroup" aria-label={t("exportWizard.selectRepo")} style={s.options}>
            <div style={s.cardTitle}>{t("exportWizard.selectRepo")}</div>
            {repos.map((r) => (
              <label key={r.id} style={s.option}>
                <input type="radio" name="ci-repo" checked={repoId === r.id} onChange={() => setRepoId(r.id)} />
                {r.full_name}
              </label>
            ))}
          </div>
        </>
      );
    }
    if (step === STEP_PREVIEW) {
      if (preview.isPending) return <div style={s.muted}>{t("exportWizard.generating")}</div>;
      if (previewError) {
        return (
          <div style={s.error}>
            <div>{previewError.message}</div>
            {runnerMissing && <div>{t("exportWizard.buildHint")}</div>}
            {!runnerMissing && <div>{t("exportWizard.previewError")}</div>}
          </div>
        );
      }
      return (
        <>
          <div style={s.cardTitle}>{t("exportWizard.filesToCreate")}</div>
          <div style={s.muted}>{t("exportWizard.secretRef")}</div>
          {files.map((f) => (
            <FileEntry
              key={f.path}
              file={f}
              value={f.editable ? (edited ?? f.contents) : f.contents}
              onChange={editWorkflow}
              collapsed={f.path.startsWith(RUNNER_PREFIX)}
            />
          ))}
        </>
      );
    }
    if (step === STEP_CONFIGURE) {
      return (
        <>
          <div style={s.options}>
            <div style={s.cardTitle}>{t("exportWizard.triggerLabel")}</div>
            {TRIGGERS.map((tr) => (
              <Checkbox
                key={tr}
                checked={triggers.includes(tr)}
                onChange={() => toggleTrigger(tr)}
                label={t(`exportWizard.triggers.${tr}`)}
              />
            ))}
            {triggers.length === 0 && <div style={s.error}>{t("exportWizard.triggerRequired")}</div>}
          </div>
          <div role="radiogroup" aria-label={t("exportWizard.postResultsLabel")} style={s.options}>
            <div style={s.cardTitle}>{t("exportWizard.postResultsLabel")}</div>
            {(Object.keys(POST_AS_KEYS) as CiPostAs[]).map((p) => (
              <label key={p} style={s.option}>
                <input type="radio" name="ci-post-as" checked={postAs === p} onChange={() => setPostAs(p)} />
                {t(`exportWizard.postAs.${POST_AS_KEYS[p]}`)}
              </label>
            ))}
          </div>
          <div style={s.hint}>{t("exportWizard.requiredCheckHint")}</div>
          {edited != null && <div style={s.hint}>{t("exportWizard.editedNote")}</div>}
        </>
      );
    }
    const repoName = repos.find((r) => r.id === repoId)?.full_name ?? "";
    return (
      <>
        <div style={s.hint}>{t("exportWizard.installCardBody", { repo: repoName, count: files.length })}</div>
        {install.data && (
          <div style={s.hint}>
            {t("exportWizard.prOpened")}{" "}
            <a href={install.data.pr_url} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("exportWizard.viewPr")}
            </a>
          </div>
        )}
        {install.error && (
          <div style={s.error}>
            <div>{t("exportWizard.installError")}</div>
            <div>{install.error.message}</div>
          </div>
        )}
      </>
    );
  };

  return (
    <Card pad={false} style={s.wrap}>
      <div style={s.head}>
        <div>
          <div style={s.title}>{t("exportWizard.title")}</div>
          <div style={s.subtitle}>{t("exportWizard.subtitle", { agentName: agent.name })}</div>
        </div>
        <IconBtn icon="X" label={t("exportWizard.close")} onClick={onClose} />
      </div>
      <ExportWizardSteps step={step} labels={STEP_KEYS.map((k) => t(`exportWizard.steps.${k}`))} />
      <div style={s.body}>{renderBody()}</div>
      <div style={s.footer}>
        <Button kind="ghost" disabled={step === STEP_TARGET} onClick={() => setStep(step - 1)}>
          {t("exportWizard.back")}
        </Button>
        {step === STEP_INSTALL ? (
          <Button
            kind="primary"
            disabled={install.isPending || !!install.data}
            onClick={() => install.mutate(installBody(state))}
          >
            {install.isPending ? t("exportWizard.installing") : t("exportWizard.openPr")}
          </Button>
        ) : (
          <Button kind="primary" disabled={!ok} onClick={next}>
            {t("exportWizard.continue")}
          </Button>
        )}
      </div>
    </Card>
  );
}

function FileEntry({
  file,
  value,
  onChange,
  collapsed,
}: {
  file: CiFile;
  value: string;
  onChange: (text: string) => void;
  collapsed: boolean;
}) {
  const t = useTranslations("ci");
  const body = file.editable ? (
    <Textarea mono rows={14} value={value} onChange={onChange} aria-label={file.path} />
  ) : (
    <pre style={s.fileBody}>{value}</pre>
  );
  const label = (
    <span style={s.filePath}>
      {file.path} <span style={s.muted}>{file.editable ? t("exportWizard.editable") : t("exportWizard.readOnly")}</span>
    </span>
  );
  return collapsed ? (
    <details>
      <summary>{label}</summary>
      {body}
    </details>
  ) : (
    <div>
      {label}
      {body}
    </div>
  );
}
