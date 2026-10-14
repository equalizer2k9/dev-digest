/* ConventionsView — /repos/:repoId/conventions. Runs the extraction, then lets
   the user judge every candidate and merge the keepers into a skill.

   Both scan buttons are ALWAYS rendered; which one is live is decided purely by
   whether a scan already exists, so the first analysis and a re-run never share
   a control. The scan is one synchronous model round-trip and can take tens of
   seconds, hence the in-flight spinner on the active button. */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { notify } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { ConventionsToolbar } from "../ConventionsToolbar";
import { CreateSkillFromConventionsModal } from "../CreateSkillFromConventionsModal";
import { SKELETON_CARDS, SKELETON_CARD_HEIGHT } from "./constants";
import { acceptedCount, isRepoNotIndexed, relativeScan, serverMessage } from "./helpers";
import { s } from "./styles";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: scan, isLoading, isError, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.name ?? repoId;
  const candidates = scan?.candidates ?? [];
  const accepted = acceptedCount(candidates);

  // `extracted_at === null` is the server's "never scanned" signal and the only
  // thing that decides which of the two buttons is live.
  const hasScan = scan?.extracted_at != null;
  const scanning = extract.isPending;
  const runActive = scanning && !hasScan;
  const rescanActive = scanning && hasScan;
  const notIndexed = extract.isError && isRepoNotIndexed(extract.error);
  const scanFailed = extract.isError && !notIndexed;

  const runScan = () => extract.mutate();

  /** One decision, optimistic, with a translated toast if the write is rejected. */
  const decide = (id: string, status: "accepted" | "pending") =>
    update.mutate(
      { id, patch: { status } },
      { onError: () => notify.error(t("errors.update")) },
    );

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scanNotes = [
    ...(scan?.warnings ?? []),
    ...(scan && scan.dropped > 0 ? [t("scan.dropped", { count: scan.dropped })] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {creating && (
        <CreateSkillFromConventionsModal
          repoId={repoId}
          repoName={repoName}
          onClose={() => setCreating(false)}
        />
      )}

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>
              {t.rich("page.title", {
                repo: repoName,
                mono: (chunks) => (
                  <span className="mono" style={s.repoName}>
                    {chunks}
                  </span>
                ),
              })}
            </h1>
            <p style={s.subtitle}>
              {scan?.extracted_at
                ? t("scan.subtitle", {
                    files: scan.sample_files,
                    when: (() => {
                      const ago = relativeScan(scan.extracted_at);
                      return t(`scan.ago.${ago.unit}`, { n: ago.n });
                    })(),
                  })
                : t("scan.subtitleNeverScanned")}
            </p>
            {scanNotes.length > 0 && <div style={s.notes}>{scanNotes.join(" · ")}</div>}
          </div>
          <div style={s.scanButtons}>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={isLoading || hasScan || scanning}
              loading={runActive}
              onClick={runScan}
            >
              {runActive ? t("scan.scanning") : t("scan.run")}
            </Button>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={isLoading || !hasScan || scanning}
              loading={rescanActive}
              onClick={runScan}
            >
              {rescanActive ? t("scan.scanning") : t("scan.rescan")}
            </Button>
          </div>
        </div>

        {notIndexed && (
          <div style={s.inlineError} role="alert">
            {serverMessage(extract.error) ?? t("scan.notIndexed")}
          </div>
        )}

        {isLoading ? (
          <div style={s.loadingStack}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={SKELETON_CARD_HEIGHT} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadErrorTitle")}
            body={t("page.loadErrorBody")}
            onRetry={() => refetch()}
          />
        ) : scanFailed ? (
          <ErrorState
            title={t("scan.failedTitle")}
            body={serverMessage(extract.error) ?? t("scan.failedBody")}
            onRetry={runScan}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={t("empty.body")}
            cta={hasScan ? undefined : t("empty.cta")}
            onCta={hasScan ? undefined : runScan}
            ctaLoading={runActive}
          />
        ) : (
          <>
            <ConventionsToolbar
              total={candidates.length}
              acceptedCount={accepted}
              busy={scanning}
              onAcceptAll={() =>
                candidates
                  .filter((c) => c.status !== "accepted")
                  .forEach((c) => decide(c.id, "accepted"))
              }
              onDeselectAll={() =>
                candidates
                  .filter((c) => c.status === "accepted")
                  .forEach((c) => decide(c.id, "pending"))
              }
              onCreateSkill={() => setCreating(true)}
            />
            {candidates.map((c) => (
              <ConventionCard
                key={c.id}
                candidate={c}
                repoId={repoId}
                repoFullName={activeRepo?.full_name ?? repoName}
                defaultBranch={activeRepo?.default_branch ?? "HEAD"}
              />
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
