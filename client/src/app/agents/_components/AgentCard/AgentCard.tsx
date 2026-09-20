/* AgentCard — model chip, skills count, enabled toggle. Stats are an A5 mount;
   we render the provider/model + skill count here.

   Deleting goes through ConfirmDialog, not `window.confirm`: a real modal with
   Confirm, Cancel and a close ×, so cancelling is a first-class path. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, IconBtn, Toggle } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../components/confirm-dialog";
import { useDeleteAgent } from "../../../../lib/hooks/agents";
import { modelColor } from "./helpers";
import { s } from "./styles";

export function AgentCard({
  ag,
  active,
  skillCount,
  onClick,
  onToggle,
}: {
  ag: Agent;
  active?: boolean;
  skillCount?: number;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("agents");
  const del = useDeleteAgent();
  const [confirming, setConfirming] = React.useState(false);
  const color = modelColor(ag.model);
  return (
    <>
      <div onClick={onClick} style={s.card(!!active, ag.enabled)}>
        <div style={s.headerRow}>
          <div style={s.iconBox}>
            <Icon.Cpu size={15} />
          </div>
          <span style={s.name}>{ag.name}</span>
          <div style={s.actions} onClick={(e) => e.stopPropagation()}>
            {onToggle && <Toggle on={ag.enabled} onChange={onToggle} size={14} />}
            <IconBtn icon="Trash" label={t("card.delete")} size={26} danger onClick={() => setConfirming(true)} />
          </div>
        </div>
        <div style={s.description}>{ag.description || t("card.noDescription")}</div>
        <div style={s.metaRow}>
          <span className="mono" style={s.modelChip(color)}>
            {ag.model}
          </span>
          {skillCount != null && (
            <Badge color="var(--text-secondary)" icon="Sparkles">
              {t("card.skillCount", { count: skillCount })}
            </Badge>
          )}
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          title={t("confirm.deleteTitle")}
          body={t("confirm.deleteBody", { name: ag.name })}
          confirmLabel={t("confirm.deleteConfirm")}
          cancelLabel={t("confirm.cancel")}
          busy={del.isPending}
          onConfirm={() => {
            setConfirming(false);
            del.mutate(ag.id);
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
