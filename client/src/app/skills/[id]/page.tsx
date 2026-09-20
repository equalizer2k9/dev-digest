/* Route: /skills/:id (Skills Lab → Skills → one skill). Reads `id` and `?tab`
   and hands both to the colocated view; every tab switch is a router.replace,
   so tabs do not stack in the back history. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "../../../components/app-shell";
import { SkillDetailView } from "./_components/SkillDetailView";
import { DEFAULT_TAB, TAB_KEYS } from "./_components/SkillDetailView/constants";

export default function SkillDetailPage() {
  const t = useTranslations("skills");
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();

  const requested = search.get("tab") ?? "";
  const tab = TAB_KEYS.includes(requested) ? requested : DEFAULT_TAB;

  const setTab = (next: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", next);
    router.replace(`/skills/${id}?${sp.toString()}`);
  };

  return (
    <AppShell
      crumb={[
        { label: t("page.crumbLab") },
        { label: t("page.crumbSkills"), href: "/skills" },
        { label: t("detail.crumbSkill") },
      ]}
    >
      <SkillDetailView id={id} tab={tab} onTab={setTab} onBack={() => router.push("/skills")} />
    </AppShell>
  );
}
