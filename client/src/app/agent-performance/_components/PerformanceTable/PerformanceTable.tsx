/* PerformanceTable — one row per agent of the dashboard. Presentational: sort direction (Accept
   column only, A-6) and the set of expanded rows are local state, so neither issues a request;
   the expansion reads `row.by_model` of the response already loaded (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { AgentPerformanceRow } from "@devdigest/shared";
import {
  formatDuration,
  formatRate,
  formatRelative,
  formatUsd,
  formatUtc,
  periodSearch,
  type PeriodParams,
} from "@/lib/agent-performance";
import { sortRows, type SortDir } from "./helpers";
import { s } from "./styles";

const rowKey = (r: AgentPerformanceRow) => r.agent_id ?? "deleted";

export function PerformanceTable({ rows, period }: { rows: AgentPerformanceRow[]; period: PeriodParams }) {
  const t = useTranslations("agentPerformance");
  const [dir, setDir] = React.useState<SortDir>("desc");
  const [open, setOpen] = React.useState<ReadonlySet<string>>(new Set());
  const [now] = React.useState(() => new Date());
  const sorted = React.useMemo(() => sortRows(rows, dir), [rows, dir]);

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const nameOf = (r: AgentPerformanceRow) => r.agent_name ?? t("table.deletedAgent");

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>{t("table.agent")}</th>
          <th style={s.th}>{t("table.runs")}</th>
          <th style={s.th}>{t("table.avgCost")}</th>
          <th style={s.th}>{t("table.avgDuration")}</th>
          <th style={s.th} aria-sort={dir === "desc" ? "descending" : "ascending"}>
            <button
              type="button"
              style={s.sortBtn}
              title={t("acceptLocalOnly")}
              aria-label={`${t("table.accept")} — ${dir === "desc" ? t("table.sortDesc") : t("table.sortAsc")}`}
              onClick={() => setDir((d) => (d === "desc" ? "asc" : "desc"))}
            >
              {t("table.accept")} {dir === "desc" ? "↓" : "↑"}
            </button>
          </th>
          <th style={s.th}>{t("table.lastRun")}</th>
          <th style={s.th}>{t("table.view")}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const key = rowKey(r);
          const view = r.agent_id ? (
            <a
              href={`/agents/${r.agent_id}?tab=stats&${periodSearch(period)}`}
              style={s.link}
              onClick={(e) => e.stopPropagation()}
            >
              {t("table.view")}
            </a>
          ) : null;

          if (r.runs === 0) {
            return (
              <tr key={key} style={s.rowStatic}>
                <td style={{ ...s.td, ...s.muted }}>{nameOf(r)}</td>
                <td colSpan={5} style={{ ...s.td, ...s.muted }}>
                  {t("table.noRuns")}
                </td>
                <td style={s.td}>{view}</td>
              </tr>
            );
          }

          const expanded = open.has(key);
          return (
            <React.Fragment key={key}>
              <tr style={s.row} onClick={() => toggle(key)} aria-expanded={expanded}>
                <td style={s.td}>
                  <span style={s.name}>{nameOf(r)}</span>
                </td>
                <td className="tnum" style={s.td}>
                  {r.runs}
                </td>
                <td className="tnum" style={s.td}>
                  {formatUsd(r.avg_cost_usd)}
                  {r.priced_runs < r.runs && (
                    <span style={s.sub}>{t("kpi.priced", { priced: r.priced_runs, runs: r.runs })}</span>
                  )}
                </td>
                <td className="tnum" style={s.td}>
                  {formatDuration(r.avg_latency_ms)}
                </td>
                <td className="tnum" style={s.td}>
                  <div style={s.acceptCell}>
                    <span>
                      {formatRate(r.accept_rate)}
                      <span style={s.sub}>{t("kpi.decided", { accepted: r.accepted, decided: r.decided })}</span>
                    </span>
                    {r.low_sample && <Badge>{t("table.lowSample")}</Badge>}
                  </div>
                </td>
                <td className="tnum" style={s.td} title={r.last_run_at ? formatUtc(r.last_run_at) : undefined}>
                  {formatRelative(r.last_run_at, now)}
                </td>
                <td style={s.td}>{view}</td>
              </tr>
              {expanded && (
                <tr>
                  <td colSpan={7} style={s.panel}>
                    <div style={s.panelTitle}>{t("table.expandedModels")}</div>
                    {r.by_model.lines.map((l) => (
                      <div key={l.key ?? "unknown"} style={s.line}>
                        <span style={s.lineLabel}>{l.label ?? t("breakdown.unknownModel")}</span>
                        <span className="tnum">{t("breakdown.runs", { runs: l.runs })}</span>
                        <span className="tnum">{formatUsd(l.cost_usd)}</span>
                      </div>
                    ))}
                    {r.by_model.unpriced_runs > 0 && (
                      <div style={{ ...s.line, ...s.muted }}>
                        {t("breakdown.unpriced", { runs: r.by_model.unpriced_runs })}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </React.Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
