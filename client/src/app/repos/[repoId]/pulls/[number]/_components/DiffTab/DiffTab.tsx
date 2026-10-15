"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Chip } from "@devdigest/ui";
import { DiffViewer, FileCard, type DiffCommentApi, type DiffFindingsApi, type DiffTarget } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  useSmartDiff,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { latestFindingsPerAgent } from "@/lib/findings";
import type { PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { EvalCaseButton } from "../EvalCaseButton";
import { DiffRoleGroup } from "../DiffRoleGroup";
import { ROLE_META } from "./constants";
import { countFilesWithFindings, groupFiles, pathsWithFindings } from "./helpers";
import { s } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** File (and line) to open: expands its role group and card, then scrolls. */
  target?: DiffTarget | null;
}

export function DiffTab({ prId, filesCount, files, canComment, repoFullName, headSha, target }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const smart = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const action = useFindingAction();
  const [order, setOrder] = React.useState<"smart" | "original">("smart");
  // `undefined` until the user clicks; then their choice wins.
  const [userChoice, setUserChoice] = React.useState<boolean | undefined>(undefined);

  // The finding CARDS (under lines / outside the patch): the same set the PR
  // list's FINDINGS column counts. Findings for a file that is not in this PR
  // have no card to attach to — they stay on Agent runs only.
  const findings = React.useMemo(() => {
    const paths = new Set(files.map((f) => f.path));
    return latestFindingsPerAgent(reviews ?? []).filter((f) => paths.has(f.file));
  }, [reviews, files]);
  // Dots and group counters come from the smart-diff response, not from `findings`.
  const withFindings = React.useMemo(
    () => (smart.data ? pathsWithFindings(smart.data.groups) : new Set<string>()),
    [smart.data],
  );

  const commentCount = comments?.length ?? 0;
  const findingCount = findings.length;
  // Shown by default when the review has something to say; the user's click wins.
  const showComments = userChoice ?? findingCount > 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setUserChoice(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const findingsApi: DiffFindingsApi = {
    findings,
    renderFinding: (f) => (
      <FindingCard
        f={f}
        defaultExpanded
        repoFullName={repoFullName}
        headSha={headSha}
        extraAction={<EvalCaseButton finding={f} />}
        pending={action.isPending}
        onAction={(act) => action.mutate({ findingId: f.id, action: act, prId: prId ?? undefined })}
      />
    ),
  };

  const grouped = smart.data && files.length > 0 ? groupFiles(smart.data.groups, files) : null;
  const smartOrder = order === "smart" && grouped !== null;

  const card = (file: PrFile, defaultOpen?: boolean) => (
    <FileCard
      key={file.path}
      file={file}
      commenting={commenting}
      findings={findingsApi}
      hasFindings={withFindings.has(file.path)}
      defaultOpen={defaultOpen}
      target={target && target.path === file.path ? { line: target.line } : undefined}
    />
  );

  const total = commentCount + findingCount;

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          total > 0 ? (
            <Button
              kind="ghost"
              size="sm"
              icon={showComments ? "EyeOff" : "Eye"}
              onClick={() => setUserChoice(!showComments)}
            >
              {showComments ? t("smartDiff.hideComments") : t("smartDiff.showComments")} ({total})
            </Button>
          ) : undefined
        }
      >
        {t("smartDiff.filesChanged", { count: filesCount })}
      </SectionLabel>

      {grouped && (
        <div role="group" aria-label={t("smartDiff.groupedByRole")} style={s.switchRow}>
          <Chip active={order === "smart"} onClick={() => setOrder("smart")}>
            {t("smartDiff.smartOrder")}
          </Chip>
          <Chip active={order === "original"} onClick={() => setOrder("original")}>
            {t("smartDiff.originalOrder")}
          </Chip>
        </div>
      )}

      {smartOrder ? (
        <div style={s.groups}>
          {grouped.groups.map(({ role, files: groupFilesList }) => {
            const meta = ROLE_META[role];
            return (
              <DiffRoleGroup
                key={role}
                role={role}
                label={t(meta.labelKey)}
                hint={t(meta.hintKey)}
                fileCount={groupFilesList.length}
                filesWithFindings={countFilesWithFindings(groupFilesList, withFindings)}
                defaultOpen={meta.startsOpen || (!!target && groupFilesList.some((f) => f.path === target.path))}
              >
                {groupFilesList.map((file) => card(file, meta.startsOpen ? undefined : false))}
              </DiffRoleGroup>
            );
          })}
          {grouped.rest.length > 0 && <div style={s.rest}>{grouped.rest.map((file) => card(file))}</div>}
        </div>
      ) : (
        <DiffViewer
          files={files}
          commenting={commenting}
          findings={findingsApi}
          findingPaths={withFindings}
          target={target}
        />
      )}
    </section>
  );
}
