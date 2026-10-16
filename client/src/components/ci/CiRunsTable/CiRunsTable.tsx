/* CiRunsTable — CI runs, shared by the /ci-runs page and the agent's CI tab. Presentational:
   every value comes from the (untrusted) artifact, so it is rendered as React text only. */
"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiRunRow } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import { STATUS_COLORS, formatDuration, isHttpsUrl, statusKey } from "./helpers";
import { s } from "./styles";

export interface CiRunsTableProps {
  runs: CiRunRow[];
}

export function CiRunsTable({ runs }: CiRunsTableProps) {
  const t = useTranslations("ci");
  const dash = t("runs.agentNone");
  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th}>{t("runs.table.repo")}</th>
          <th style={s.th}>{t("runs.table.pullRequest")}</th>
          <th style={s.th}>{t("runs.table.agent")}</th>
          <th style={s.th}>{t("runs.table.status")}</th>
          <th style={s.th}>{t("runs.table.findings")}</th>
          <th style={s.th}>{t("runs.table.cost")}</th>
          <th style={s.th}>{t("runs.table.duration")}</th>
          <th style={s.th}>{t("runs.table.when")}</th>
          <th style={s.th}>{t("runs.table.link")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => {
          const key = statusKey(r.status);
          const colors = (r.status && STATUS_COLORS[r.status]) || undefined;
          return (
            <tr key={r.id}>
              <td style={s.td}>{r.repo ?? dash}</td>
              <td className="tnum" style={s.td}>{r.pr_number == null ? dash : `#${r.pr_number}`}</td>
              <td style={s.td}>{r.agent ?? dash}</td>
              <td style={s.td}>
                {r.status ? (
                  <Badge color={colors?.color} bg={colors?.bg}>
                    {key ? t(key) : r.status}
                  </Badge>
                ) : (
                  dash
                )}
              </td>
              <td className="tnum" style={s.td}>{r.findings_count ?? dash}</td>
              <td className="tnum" style={s.td}>{formatCost(r.cost_usd)}</td>
              <td className="tnum" style={s.td}>{formatDuration(r.duration_s)}</td>
              <td className="tnum" style={s.td}>{r.ran_at ? new Date(r.ran_at).toLocaleString() : dash}</td>
              <td style={s.td}>
                {r.github_url && isHttpsUrl(r.github_url) ? (
                  <a href={r.github_url} target="_blank" rel="noopener noreferrer" style={s.link}>
                    {t("runs.openRun")}
                  </a>
                ) : (
                  dash
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
