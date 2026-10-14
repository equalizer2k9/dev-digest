/* CreateSkillModal — "Create from scratch": exactly name, description, type
   and a Markdown body. POST /skills, then the new card appears in the grid. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, SelectInput, TextInput, Textarea } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { SKILL_TYPE_VALUES } from "../../../../../../lib/skill-types";
import { DEFAULT_TYPE, MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const create = useCreateSkill();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_TYPE);
  const [body, setBody] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Type labels are i18n'd; the values stay the contract's enum.
  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`listItem.type.${v}`) }));

  const submit = async () => {
    if (!name.trim() || !body.trim()) {
      setError(t("create.required"));
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ name: name.trim(), description, type, body });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("import.failed"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && <div style={s.error}>{error}</div>}
        <FormField label={t("create.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.namePlaceholder")} mono />
        </FormField>
        <FormField label={t("create.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.type")}>
          <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={typeOptions} />
        </FormField>
        <FormField label={t("create.body")} required>
          <Textarea value={body} onChange={setBody} rows={10} mono placeholder={t("create.bodyPlaceholder")} />
        </FormField>
      </div>
    </Modal>
  );
}
