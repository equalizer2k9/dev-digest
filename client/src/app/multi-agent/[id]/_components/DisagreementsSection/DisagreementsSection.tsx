/* DisagreementsSection — matrix of finding groups (rows) by agent runs (columns). A conflict is
   marked; "Show only conflicts" filters on the client with no request. No explanation text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Toggle } from "@devdigest/ui";
import type { FindingGroup, MultiRunAgent } from "@devdigest/shared";
import { cellFor, visibleGroups } from "./helpers";
import { s } from "./styles";

export interface DisagreementsSectionProps {
  groups: FindingGroup[];
  agents: MultiRunAgent[];
}

export function DisagreementsSection({ groups, agents }: DisagreementsSectionProps) {
  const t = useTranslations("multiAgent");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);
  const shown = visibleGroups(groups, onlyConflicts);

  return (
    <div>
      <label style={s.toolbar}>
        {t("disagree.onlyConflicts")}
        <Toggle on={onlyConflicts} onChange={setOnlyConflicts} size={16} />
      </label>
      {groups.length === 0 ? (
        <div style={s.note}>{t("disagree.empty")}</div>
      ) : shown.length === 0 ? (
        <div style={s.note}>{t("disagree.noConflicts")}</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>{t("disagree.finding")}</th>
              {agents.map((a) => (
                <th key={a.run_id} style={s.th}>
                  {a.agent_name ?? t("column.deletedAgent")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((g) => (
              <tr key={g.id} data-group-id={g.id} data-conflict={g.conflict}>
                <td style={{ ...s.td, ...s.finding }}>
                  {g.representative.title}
                  {g.conflict && (
                    <Badge color="var(--warn)" style={s.conflict}>
                      {t("disagree.conflict")}
                    </Badge>
                  )}
                </td>
                {agents.map((a) => (
                  <td key={a.run_id} style={s.td}>
                    {t(`cell.${cellFor(g, a.run_id)}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
