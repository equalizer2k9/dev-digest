/* SkillPreviewDrawer — the right-hand preview for a card on the /skills grid.

   A Drawer, deliberately: the grid stays mounted and visible behind it, so
   previewing a skill is neither a modal nor a navigation. "Open →" is the only
   thing here that leaves the page. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Drawer, Markdown } from "@devdigest/ui";
import type { SkillWithUsage } from "@devdigest/shared";
import { SKILL_TYPE_COLOR } from "../../../../lib/skill-types";
import { PREVIEW_DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

export function SkillPreviewDrawer({
  skill,
  onOpen,
  onClose,
}: {
  skill: SkillWithUsage;
  /** Navigates to /skills/:id. */
  onOpen?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("skills");
  const color = SKILL_TYPE_COLOR[skill.type];

  return (
    <Drawer
      width={PREVIEW_DRAWER_WIDTH}
      title={skill.name}
      subtitle={skill.description || t("card.noDescription")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="primary" size="sm" iconRight="ArrowRight" onClick={onOpen}>
            {t("drawer.open")}
          </Button>
        </div>
      }
    >
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
      <div style={s.body}>
        {skill.body ? <Markdown>{skill.body}</Markdown> : <span style={s.empty}>{t("preview.empty")}</span>}
      </div>
    </Drawer>
  );
}
