/* /skills/:id — Config · Preview · Versioning for one skill.

   Preview renders the body through the Markdown primitive: headings, lists and
   fenced code become elements, never a <pre> of raw markdown source. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Markdown, Skeleton, Tabs } from "@devdigest/ui";
import { useSkill } from "../../../../../lib/hooks/skills";
import { SKILL_TYPE_COLOR } from "../../../../../lib/skill-types";
import { SkillConfigTab } from "./_components/SkillConfigTab";
import { SkillVersionsTab } from "./_components/SkillVersionsTab";
import { TABS } from "./constants";
import { s } from "./styles";

export function SkillDetailView({
  id,
  tab,
  onTab,
  onBack,
}: {
  id: string;
  tab: string;
  onTab: (t: string) => void;
  onBack?: () => void;
}) {
  const t = useTranslations("skills");
  const { data: skill, isLoading, isError, refetch } = useSkill(id);

  const tabs = TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));

  if (isLoading) {
    return (
      <div style={s.body}>
        <Skeleton height={24} width={240} />
        <Skeleton height={220} />
      </div>
    );
  }
  if (isError || !skill) {
    return (
      <ErrorState
        fullScreen
        title={t("detail.notFound.title")}
        body={t("detail.loadError")}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h1 style={s.h1}>{skill.name}</h1>
        <Badge color={SKILL_TYPE_COLOR[skill.type]} bg="var(--bg-hover)">
          {t(`listItem.type.${skill.type}`)}
        </Badge>
        <Badge color="var(--text-secondary)">{t("card.version", { version: skill.version })}</Badge>
        {onBack && (
          <button type="button" onClick={onBack} style={s.back}>
            {t("detail.back")}
          </button>
        )}
      </div>

      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={onTab} pad="0" />
      </div>

      <div style={s.body}>
        {tab === "config" && <SkillConfigTab skill={skill} />}
        {tab === "preview" && (
          <div style={s.preview} data-testid="skill-preview">
            {skill.body ? (
              <Markdown>{skill.body}</Markdown>
            ) : (
              <span style={s.previewEmpty}>{t("preview.empty")}</span>
            )}
          </div>
        )}
        {tab === "versioning" && <SkillVersionsTab skill={skill} />}
      </div>
    </div>
  );
}
