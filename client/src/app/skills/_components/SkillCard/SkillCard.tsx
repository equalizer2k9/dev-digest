/* SkillCard — one tile on the /skills grid: name, type chip, one-line
   description, enabled toggle, current version, source, how many agents link
   it, and a trash button.

   Presentational: the mutations live in SkillsGridView. The only state it owns
   is the delete confirmation, so `onDelete` fires only after the dialog's
   Confirm — never straight off the trash click. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn, Toggle } from "@devdigest/ui";
import type { SkillWithUsage } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { SKILL_TYPE_COLOR } from "../../../../lib/skill-types";
import { s } from "./styles";

export function SkillCard({
  skill,
  onOpen,
  onToggle,
  onDelete,
  busy,
}: {
  skill: SkillWithUsage;
  /** Card click (anywhere but the toggle and the trash) — opens the preview. */
  onOpen?: () => void;
  onToggle?: (enabled: boolean) => void;
  /** Called only after the confirmation dialog is confirmed. */
  onDelete?: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("skills");
  const [confirming, setConfirming] = React.useState(false);
  const color = SKILL_TYPE_COLOR[skill.type];

  return (
    <>
      <div onClick={onOpen} style={s.card(skill.enabled)} data-testid={`skill-card-${skill.id}`}>
        <div style={s.headerRow}>
          <div style={s.iconBox(color)}>
            <Icon.Sparkles size={15} />
          </div>
          <span style={s.name}>{skill.name}</span>
          <div style={s.actions} onClick={(e) => e.stopPropagation()}>
            {onToggle && <Toggle on={skill.enabled} onChange={onToggle} size={14} />}
            {onDelete && (
              <IconBtn icon="Trash" label={t("card.delete")} size={26} danger onClick={() => setConfirming(true)} />
            )}
          </div>
        </div>

        <div style={s.description}>{skill.description || t("card.noDescription")}</div>

        <div style={s.metaRow}>
          <Badge color={color} bg="var(--bg-hover)">
            {t(`listItem.type.${skill.type}`)}
          </Badge>
          <Badge color="var(--text-secondary)">{t("card.version", { version: skill.version })}</Badge>
          <Badge color="var(--text-muted)">{t(`listItem.source.${skill.source}`)}</Badge>
          <span className="tnum" style={s.agentCount}>
            {t("card.agents", { count: skill.agent_count })}
          </span>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t("confirm.deleteTitle")}
          body={t("confirm.deleteBody", { name: skill.name })}
          confirmLabel={t("confirm.deleteConfirm")}
          cancelLabel={t("confirm.cancel")}
          busy={busy}
          onConfirm={() => {
            setConfirming(false);
            onDelete?.();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
