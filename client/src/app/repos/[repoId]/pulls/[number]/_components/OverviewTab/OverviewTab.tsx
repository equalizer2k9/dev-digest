"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useGenerateBrief, usePrBrief } from "@/lib/hooks/brief";
import { BlastRadius } from "../BlastRadius";
import { PrBriefBlock } from "../PrBriefBlock";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
  files: PrFile[];
  onOpenFile(path: string, line: number | null): void;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha, files, onOpenFile }: OverviewTabProps) {
  const t = useTranslations("blast");
  const tPr = useTranslations("prReview");
  const { data, isPending, isError } = useBlastRadius(prId);
  const briefQuery = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const prFilePaths = React.useMemo(() => new Set(files.map((f) => f.path)), [files]);
  const generateError = generate.isError
    ? generate.error instanceof ApiError && generate.error.code === "brief_no_files"
      ? "noFiles"
      : "failed"
    : null;

  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{tPr("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}

      <PrBriefBlock
        status={briefQuery.isPending ? "loading" : briefQuery.isError ? "loadError" : "ready"}
        brief={briefQuery.data?.brief ?? null}
        headSha={headSha}
        prFilePaths={prFilePaths}
        generating={generate.isPending}
        generateError={generateError}
        onGenerate={() => generate.mutate(headSha)}
        onRetryLoad={() => briefQuery.refetch()}
        onOpenFile={onOpenFile}
      />

      {isError ? (
        <div role="alert" style={s.error}>{t("error")}</div>
      ) : isPending || !data ? (
        <div data-testid="blast-loading" style={s.loading}>
          <Skeleton width={160} height={14} />
          <Skeleton height={72} />
        </div>
      ) : (
        <BlastRadius blast={data} repoFullName={repoFullName} headSha={headSha} />
      )}
    </>
  );
}
