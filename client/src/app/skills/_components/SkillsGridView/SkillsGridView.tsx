/* /skills — the Skills grid. Cards in a responsive auto-fill grid, a local
   search box, an "Add Skill" menu (create · import), and a right-hand preview
   drawer that leaves the grid mounted behind it. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useDeleteSkill, useSkills, useUpdateSkill } from "../../../../lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillPreviewDrawer } from "../SkillPreviewDrawer";
import { CreateSkillModal } from "./_components/CreateSkillModal";
import { ImportSkillModal } from "./_components/ImportSkillModal";
import { SKELETON_CARDS } from "./constants";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsGridView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const update = useUpdateSkill();
  const del = useDeleteSkill();

  const [search, setSearch] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  // Preview selection is local state, not a URL param — the drawer is a
  // transient look, not a linkable place (see the spec's open question).
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const list = filterSkills(skills ?? [], search);
  const preview = (skills ?? []).find((sk) => sk.id === previewId) ?? null;

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      {creating && <CreateSkillModal onClose={() => setCreating(false)} />}
      {importing && <ImportSkillModal onClose={() => setImporting(false)} />}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.heading")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <Dropdown
            width={220}
            align="right"
            trigger={
              <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                {t("page.addSkill")}
              </Button>
            }
            items={[
              { label: t("page.menu.fromScratch"), icon: "Edit", onClick: () => setCreating(true) },
              { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setImporting(true) },
            ]}
          />
        </div>

        {isLoading && (
          <div style={s.grid}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={130} />
            ))}
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && list.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={search ? t("page.noMatch.title") : t("page.empty.title")}
            body={search ? t("page.noMatch.body") : t("page.empty.body")}
            cta={search ? undefined : t("page.empty.cta")}
            onCta={search ? undefined : () => setCreating(true)}
          />
        )}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                busy={del.isPending}
                onOpen={() => setPreviewId(sk.id)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                onDelete={() => {
                  if (previewId === sk.id) setPreviewId(null);
                  del.mutate(sk.id);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {preview && (
        <SkillPreviewDrawer
          skill={preview}
          onOpen={() => router.push(`/skills/${preview.id}?tab=config`)}
          onClose={() => setPreviewId(null)}
        />
      )}
    </AppShell>
  );
}
