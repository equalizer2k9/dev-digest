"use client";

import { useTranslations } from "next-intl";
import { Badge, RunCostBadge } from "@devdigest/ui";
import type { EvalRunRecord } from "@devdigest/shared";
import { formatMetric, formatPassed } from "../EvalMetrics";
import { STATUS_COLORS } from "./helpers";
import { s } from "./styles";

export interface EvalRunTableProps {
  runs: EvalRunRecord[];
  showAgent?: boolean;
  selectable?: boolean;
  selected?: string[];
  onToggle?: (id: string) => void;
}

/** Run history / recent runs. Only completed runs can be selected (for Compare). */
export function EvalRunTable({ runs, showAgent, selectable, selected = [], onToggle }: EvalRunTableProps) {
  const t = useTranslations("eval");
  const metric = (v: number | null) => formatMetric(v) ?? <span style={s.muted}>{t("na")}</span>;
  return (
    <table style={s.table}>
      <thead>
        <tr>
          {selectable && <th style={s.th} />}
          <th style={s.th}>{t("dashboard.table.ranAt")}</th>
          <th style={s.th}>{t("dashboard.table.status")}</th>
          <th style={s.th} />
          {showAgent && <th style={s.th}>{t("dashboard.table.agent")}</th>}
          <th style={s.th}>{t("dashboard.table.version")}</th>
          <th style={s.th}>{t("dashboard.table.recall")}</th>
          <th style={s.th}>{t("dashboard.table.precision")}</th>
          <th style={s.th}>{t("dashboard.table.citation")}</th>
          <th style={s.th}>{t("dashboard.table.pass")}</th>
          <th style={s.th}>{t("dashboard.table.cost")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id}>
            {selectable && (
              <td style={s.td}>
                {r.status === "completed" && (
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={() => onToggle?.(r.id)}
                    aria-label={r.started_at}
                  />
                )}
              </td>
            )}
            <td className="tnum" style={s.td}>
              {new Date(r.started_at).toLocaleString()}
            </td>
            <td style={s.td}>
              <Badge color={STATUS_COLORS[r.status].color} bg={STATUS_COLORS[r.status].bg}>
                {t(`status.${r.status}`)}
              </Badge>
            </td>
            <td style={s.td}>
              {r.has_errors && (
                <span role="img" aria-label={t("hasErrors")} title={t("hasErrors")} style={s.errorMark}>
                  !
                </span>
              )}
            </td>
            {showAgent && <td style={s.td}>{r.agent_name}</td>}
            <td className="tnum" style={s.td}>{`v${r.agent_version}`}</td>
            <td className="tnum" style={s.td}>{metric(r.recall)}</td>
            <td className="tnum" style={s.td}>{metric(r.precision)}</td>
            <td className="tnum" style={s.td}>{metric(r.citation_accuracy)}</td>
            <td className="tnum" style={s.td}>{formatPassed(r.passed, r.total)}</td>
            <td style={s.td}>
              <RunCostBadge usd={r.cost_usd} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
