/* SkillContextSection — "Project context to use": the repository documents this
   skill brings to every agent that links it. List and writes live in
   AttachmentsEditor; the repository is the active one. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { AttachmentsEditor } from "@/components/project-context/AttachmentsEditor";
import { useContextAttachments, useContextDocuments } from "@/lib/hooks/project-context";
import { useActiveRepo } from "@/lib/repo-context";
import { SerializesAs } from "./_components/SerializesAs";

export function SkillContextSection({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const list = useContextDocuments(repoId);
  const attachments = useContextAttachments("skill", skill.id, repoId);
  const hasData = !!list.data?.has_clone && !!attachments.data;
  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("section.title")}</h2>
      <AttachmentsEditor owner="skill" ownerId={skill.id} />
      {hasData && <SerializesAs attached={attachments.data!.attached} documents={list.data!.documents} />}
    </section>
  );
}
