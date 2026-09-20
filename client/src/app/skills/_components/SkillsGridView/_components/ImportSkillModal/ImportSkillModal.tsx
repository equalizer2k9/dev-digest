/* ImportSkillModal — "Import from file": pick a .md or .zip, see the parsed
   core, correct it, then save.

   Two calls, one parser: POST /skills/import/preview persists nothing and is
   what fills this form; POST /skills/import re-parses the same file and saves
   it with the fields edited here. The body is shown *rendered* and is not
   editable — it is stored verbatim as untrusted data, and the import route
   accepts only name/description/type overrides. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Markdown, Modal, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillImportPreview, SkillType } from "@devdigest/shared";
import { useImportSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPE_VALUES } from "../../../../../../lib/skill-types";
import { ACCEPTED_EXTENSIONS, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const preview = useImportSkillPreview();
  const save = useImportSkill();

  const [file, setFile] = React.useState<File | null>(null);
  const [parsed, setParsed] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("custom");
  const [error, setError] = React.useState<string | null>(null);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const onPick = async (picked: File | null) => {
    setFile(picked);
    setParsed(null);
    setError(null);
    if (!picked) return;
    try {
      const core = await preview.mutateAsync(picked);
      setParsed(core);
      setName(core.name);
      setDescription(core.description);
      setType(core.type);
    } catch (e) {
      // Server-side rejections (too large, ambiguous zip, unsupported format)
      // belong inline in the modal, not in a toast that outlives it.
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  const submit = async () => {
    if (!file || !parsed) return;
    setError(null);
    try {
      await save.mutateAsync({ file, name, description, type });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Upload"
            onClick={submit}
            disabled={!parsed || save.isPending}
          >
            {save.isPending ? t("import.saving") : t("import.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && (
          <div role="alert" style={s.error}>
            {error}
          </div>
        )}

        <FormField label={t("import.fileLabel")} hint={t("import.fileHint")} required>
          <input
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            aria-label={t("import.fileLabel")}
            onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
            style={s.fileInput}
          />
        </FormField>

        {preview.isPending && <div style={s.note}>{t("import.parsing")}</div>}
        {!file && !preview.isPending && <div style={s.note}>{t("import.choose")}</div>}

        {parsed && (
          <div style={s.preview}>
            <h3 style={s.previewTitle}>{t("import.previewTitle")}</h3>
            <FormField label={t("import.name")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("import.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <FormField label={t("import.type")}>
              <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
            </FormField>
            {parsed.warnings.length > 0 && (
              <div style={s.warnings}>
                <Badge color="var(--warn)" icon="AlertTriangle">
                  {t("import.warnings")}
                </Badge>
                <ul style={s.warningList}>
                  {parsed.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <FormField label={t("import.bodyLabel")} hint={t("import.bodyHint")}>
              <div style={s.renderedBody} data-testid="import-rendered-body">
                <Markdown>{parsed.body}</Markdown>
              </div>
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  );
}
