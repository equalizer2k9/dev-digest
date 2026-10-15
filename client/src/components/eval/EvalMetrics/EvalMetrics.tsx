"use client";

import { useTranslations } from "next-intl";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatMetric, formatPassed } from "./helpers";
import { s } from "./styles";

type MetricsRun = Pick<EvalRunRecord, "recall" | "precision" | "citation_accuracy" | "passed" | "total">;

/** The three eval metrics of one run plus its passed count. A null metric is "n/a", never 0%. */
export function EvalMetrics({ run }: { run: MetricsRun }) {
  const t = useTranslations("eval");
  const tiles = [
    { key: "recall", label: t("dashboard.metrics.recall"), value: run.recall },
    { key: "precision", label: t("dashboard.metrics.precision"), value: run.precision },
    { key: "citation", label: t("dashboard.metrics.citationAccuracy"), value: run.citation_accuracy },
  ];
  return (
    <div style={s.wrap}>
      {tiles.map((m) => {
        const text = formatMetric(m.value);
        return (
          <div key={m.key} style={s.tile}>
            <span style={s.label}>{m.label}</span>
            <span className="tnum" style={text == null ? s.na : s.value}>
              {text ?? t("na")}
            </span>
          </div>
        );
      })}
      <span className="tnum" style={s.passed}>
        {t("passedCount", { passed: run.passed, total: run.total })}
      </span>
    </div>
  );
}
