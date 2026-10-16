/* EvalSingleRunResult — the outcome of one single-case run (AC-50): status, kept/dropped,
   duration and cost ("—" when unknown). Presentational; shared by the case modal and the Evals tab. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, RunCostBadge } from "@devdigest/ui";
import type { EvalExpectationType, EvalSingleRun } from "@devdigest/shared";
import { formatSeconds } from "./helpers";
import { STATUS_COLORS, s } from "./styles";

export interface EvalSingleRunResultProps {
  result: EvalSingleRun;
  /** When given, the summary says what the case expected. */
  expectationType?: EvalExpectationType;
}

export function EvalSingleRunResult({ result, expectationType }: EvalSingleRunResultProps) {
  const t = useTranslations("eval");
  const color = STATUS_COLORS[result.status];
  const counts = {
    kept: result.kept,
    dropped: result.dropped,
    seconds: formatSeconds(result.duration_ms),
  };
  const summary = expectationType
    ? t("singleRun.summary", {
        ...counts,
        expected: t(expectationType === "must_find" ? "singleRun.expectedFind" : "singleRun.expectedNone"),
      })
    : t("singleRun.summaryNoExpectation", counts);
  return (
    <div style={s.box} data-testid="single-run-result">
      <div style={s.line}>
        <Badge color={color.color} bg={color.bg}>
          {t(`status.${result.status}`)}
        </Badge>
        <span>{summary}</span>
        <span style={s.line}>
          <span>{t("singleRun.cost")}</span>
          <RunCostBadge usd={result.cost_usd} />
        </span>
      </div>
      {result.status === "error" && result.error && (
        <div style={s.error}>{t("singleRun.errorReason", { error: result.error })}</div>
      )}
    </div>
  );
}
