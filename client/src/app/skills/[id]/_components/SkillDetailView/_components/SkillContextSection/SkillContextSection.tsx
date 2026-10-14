/* SkillContextSection — "Project context to use": the repository documents this
   skill brings to every agent that links it. List and writes live in
   AttachmentsEditor; the repository is the active one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { AttachmentsEditor } from "@/components/project-context/AttachmentsEditor";

export function SkillContextSection({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("section.title")}</h2>
      <AttachmentsEditor owner="skill" ownerId={skill.id} />
    </section>
  );
}
