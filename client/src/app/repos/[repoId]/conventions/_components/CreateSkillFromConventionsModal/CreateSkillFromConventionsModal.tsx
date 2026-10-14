/* CreateSkillFromConventionsModal — the accepted conventions merged into one
   editable skill. The draft (name, description, type, enabled, body) is built
   server-side from `status = 'accepted'` rows only; everything in here is
   editable and what POSTs is what was edited, never the draft's originals.

   The design's `CodeEditor` is deliberately NOT ported — the body is a mono
   Textarea, which is the same text with none of the extra surface. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  Modal,
  SearchableSelect,
  SelectInput,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { SKILL_TYPE_VALUES } from "@/lib/skill-types";
import { notify } from "@/lib/toast";
import { BODY_ROWS, MODAL_WIDTH, NO_AGENT } from "./constants";
import { s } from "./styles";

export interface CreateSkillFromConventionsModalProps {
  repoId: string;
  /** Repo name for the banner — where the conventions came from. */
  repoName: string;
  onClose: () => void;
}

export function CreateSkillFromConventionsModal({
  repoId,
  repoName,
  onClose,
}: CreateSkillFromConventionsModalProps) {
  const t = useTranslations("conventions");
  // Enabled only while this modal is mounted, and never served stale.
  const { data: draft, isError } = useConventionDraft(repoId, true);

  if (!draft) {
    return (
      <Modal width={MODAL_WIDTH} title={t("create.title")} onClose={onClose}>
        <div style={s.loading}>{isError ? t("errors.draft") : t("create.loading")}</div>
      </Modal>
    );
  }

  // Remounted per draft so the form's initial state comes from the fetched draft
  // without an effect that copies props into state.
  return (
    <DraftForm
      key={`${draft.name}:${draft.count}`}
      draft={draft}
      repoId={repoId}
      repoName={repoName}
      onClose={onClose}
    />
  );
}

function DraftForm({
  draft,
  repoId,
  repoName,
  onClose,
}: {
  draft: ConventionSkillDraft;
  repoId: string;
  repoName: string;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const create = useCreateConventionSkill(repoId);
  const { data: agents } = useAgents();

  const [name, setName] = React.useState(draft.name);
  const [description, setDescription] = React.useState(draft.description);
  const [type, setType] = React.useState<SkillType>(draft.type);
  const [enabled, setEnabled] = React.useState(draft.enabled);
  const [body, setBody] = React.useState(draft.body);
  const [agentId, setAgentId] = React.useState<string>(NO_AGENT);
  const [error, setError] = React.useState<string | null>(null);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`create.types.${v}`) }));
  const agentOptions = [
    { value: NO_AGENT, label: t("create.agentNone") },
    ...(agents ?? []).map((a) => ({ value: a.id, label: a.name })),
  ];

  const canSubmit = !!name.trim() && !!body.trim() && !create.isPending;

  const submit = async () => {
    setError(null);
    try {
      const skill = await create.mutateAsync({
        name: name.trim(),
        description,
        type,
        enabled,
        body,
        // Only sent when the user actually picked an agent.
        ...(agentId !== NO_AGENT ? { agent_id: agentId } : {}),
      });
      notify.toast(
        <span>
          {t("create.created", { name: skill.name, count: draft.count })}{" "}
          <Link href={`/skills/${skill.id}`} style={s.toastLink}>
            {t("create.openInSkills")}
          </Link>
        </span>,
        "success",
      );
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("errors.create"));
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={draft.name}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("create.savedAs")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Sparkles" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("create.creating") : t("create.submit")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {error && <div style={s.error}>{error}</div>}

        <div style={s.banner}>
          <Icon.Wrench size={15} style={s.bannerIcon} />
          <span>
            {t.rich("create.banner", {
              count: draft.count,
              repo: repoName,
              b: (chunks) => <b style={s.bannerStrong}>{chunks}</b>,
              mono: (chunks) => (
                <span className="mono" style={s.bannerMono}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>

        <FormField label={t("create.name")} required>
          <TextInput
            value={name}
            onChange={setName}
            placeholder={t("create.namePlaceholder")}
            aria-label={t("create.name")}
            mono
          />
        </FormField>
        <FormField label={t("create.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.descriptionPlaceholder")}
            aria-label={t("create.description")}
          />
        </FormField>

        <div style={s.row}>
          <div style={s.col}>
            <FormField label={t("create.type")}>
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={typeOptions}
              />
            </FormField>
          </div>
          <div style={s.col}>
            <FormField label={t("create.enabled")} hint={t("create.enabledHint")}>
              <div style={s.toggleWrap}>
                <Toggle on={enabled} onChange={setEnabled} size={17} />
              </div>
            </FormField>
          </div>
        </div>

        <FormField label={t("create.body")} required hint={t("create.bodyHint")}>
          <Textarea
            value={body}
            onChange={setBody}
            rows={BODY_ROWS}
            aria-label={t("create.body")}
            mono
          />
        </FormField>

        <FormField label={t("create.agent")}>
          <SearchableSelect
            value={agentId}
            onChange={setAgentId}
            options={agentOptions}
            placeholder={t("create.agentNone")}
          />
        </FormField>
      </div>
    </Modal>
  );
}
