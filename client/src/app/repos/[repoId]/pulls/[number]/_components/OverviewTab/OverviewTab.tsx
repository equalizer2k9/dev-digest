"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/blast";
import { BlastRadius } from "../BlastRadius";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  const t = useTranslations("blast");
  const tPr = useTranslations("prReview");
  const { data, isPending, isError } = useBlastRadius(prId);

  return (
    <>
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">{tPr("overview.description")}</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}

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
