/* SkillConfigTab — edit a skill's name, description, type, body and enabled
   flag, and delete it.

   The hint under the body is the versioning contract made visible: saving a
   CHANGED body snapshots the current text as the next version; a metadata-only
   save (a rename, a toggle) does not. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { Skill, SkillType } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SKILL_TYPE_VALUES } from "../../../../../../../lib/skill-types";
import { s } from "../../styles";

export function SkillConfigTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [name, setName] = React.useState(skill.name);
  const [description, setDescription] = React.useState(skill.description);
  const [type, setType] = React.useState<SkillType>(skill.type);
  const [body, setBody] = React.useState(skill.body);
  const [enabled, setEnabled] = React.useState(skill.enabled);
  const [confirming, setConfirming] = React.useState(false);

  // Reset the form when the route swaps to a different skill.
  React.useEffect(() => {
    setName(skill.name);
    setDescription(skill.description);
    setType(skill.type);
    setBody(skill.body);
    setEnabled(skill.enabled);
  }, [skill.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const save = () =>
    update.mutate(
      { id: skill.id, patch: { name, description, type, body, enabled } },
      { onSuccess: (data) => toast.success(t("config.savedToast", { version: data.version })) },
    );

  return (
    <div style={s.form}>
      <div style={s.formHeader}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={enabled} onChange={setEnabled} size={16} />
        </label>
      </div>

      <FormField label={t("config.name")} required>
        <TextInput value={name} onChange={setName} mono />
      </FormField>
      <FormField label={t("config.description")}>
        <TextInput value={description} onChange={setDescription} />
      </FormField>
      <FormField label={t("config.type")}>
        <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
      </FormField>
      <FormField label={t("config.body")} hint={t("config.bodyHint", { next: skill.version + 1 })}>
        <Textarea value={body} onChange={setBody} rows={14} mono />
      </FormField>

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
      </div>

      <div style={s.danger}>
        <div style={s.dangerTitle}>{t("config.dangerTitle")}</div>
        <p style={s.dangerBody}>{t("config.dangerBody")}</p>
        <Button kind="danger" icon="Trash" onClick={() => setConfirming(true)} disabled={del.isPending}>
          {t("config.delete")}
        </Button>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t("confirm.deleteTitle")}
          body={t("confirm.deleteBody", { name: skill.name })}
          confirmLabel={t("confirm.deleteConfirm")}
          cancelLabel={t("confirm.cancel")}
          busy={del.isPending}
          onConfirm={() => {
            setConfirming(false);
            del.mutate(skill.id, { onSuccess: () => router.push("/skills") });
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
