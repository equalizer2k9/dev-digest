/* SkillVersionsTab — every snapshot of this skill, newest first.

   The current version is badged and has no buttons: there is nothing to diff
   it against and nothing to restore. Every older row offers Diff (computed in
   the browser) and Restore, which re-applies that body as a NEW version so the
   history stays append-only and a restore is itself undoable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { VersionDiffModal } from "../VersionDiffModal";
import { s } from "../../styles";

export function SkillVersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();

  const [diffing, setDiffing] = React.useState<number | null>(null);
  const [restoring, setRestoring] = React.useState<number | null>(null);

  // Newest first — the server already orders it, but the tab does not depend on that.
  const rows = React.useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions],
  );

  if (isLoading) {
    return (
      <div>
        <Skeleton height={48} />
        <Skeleton height={48} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("versions.loadError")} onRetry={() => refetch()} />;

  return (
    <div>
      <h2 style={s.h2}>{t("versions.title")}</h2>
      <p style={s.versionsIntro}>{t("versions.subtitle")}</p>

      {rows.length === 0 && <div style={s.previewEmpty}>{t("versions.empty")}</div>}

      {rows.map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.versionRow} data-testid={`version-row-${v.version}`}>
            <span className="mono tnum" style={s.versionLabel}>
              {t("versions.version", { version: v.version })}
            </span>
            <span style={s.versionDate}>{v.created_at}</span>
            {isCurrent ? (
              <Badge color="var(--ok)" bg="var(--ok-bg)" icon="Check">
                {t("versions.current")}
              </Badge>
            ) : (
              <div style={s.versionActions}>
                <Button kind="secondary" size="sm" icon="Code" onClick={() => setDiffing(v.version)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  onClick={() => setRestoring(v.version)}
                  disabled={restore.isPending}
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffing != null && (
        <VersionDiffModal
          skillId={skill.id}
          version={diffing}
          currentVersion={skill.version}
          currentBody={skill.body}
          onClose={() => setDiffing(null)}
        />
      )}

      {restoring != null && (
        <ConfirmDialog
          tone="primary"
          title={t("confirm.restoreTitle")}
          body={t("confirm.restoreBody", { version: restoring })}
          confirmLabel={t("confirm.restoreConfirm")}
          cancelLabel={t("confirm.cancel")}
          busy={restore.isPending}
          onConfirm={() => {
            const version = restoring;
            setRestoring(null);
            restore.mutate(
              { id: skill.id, version },
              {
                onSuccess: (data) =>
                  toast.success(t("versions.restoredToast", { version, newVersion: data.version })),
              },
            );
          }}
          onClose={() => setRestoring(null)}
        />
      )}
    </div>
  );
}
