"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useIntent, useRecalculateIntent } from "@/lib/hooks/intent";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  const intent = useIntent(prId);
  const recalc = useRecalculateIntent(prId);
  return (
    <>
      {prId && (
        <IntentCard
          intent={intent.data?.intent}
          isLoading={intent.isLoading}
          isError={intent.isError}
          onRetry={() => intent.refetch()}
          onRecalculate={() => recalc.mutate()}
          isRecalculating={recalc.isPending}
          recalcError={recalc.error instanceof ApiError ? recalc.error : recalc.error ? new ApiError("", 0) : null}
        />
      )}
      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
