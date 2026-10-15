/* DocPicker — the attach list of project-context documents: the owner's own
   documents in stored order, those that reach it through a skill, then the rest.
   Presentational: rows and writes come in through props. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, Icon, IconBtn } from "@devdigest/ui";
import type {
  ProjectContextDocument,
  ProjectContextEffective,
  ProjectContextSkipReason,
} from "@devdigest/shared";
import { visiblePath } from "@/lib/visible-path";
import { SECTION_TOKEN_BUDGET } from "./constants";
import { buildRows, filterRows, sumTokens } from "./helpers";
import { s } from "./styles";

export interface DocPickerProps {
  documents: ProjectContextDocument[];
  attached: string[];
  effective: ProjectContextEffective[];
  truncated: boolean;
  /** Optional counter line shown above the list (e.g. "2 of 5 attached"). */
  counter?: string;
  selectedPath: string | null;
  onToggle: (path: string, on: boolean) => void;
  onMove: (path: string, delta: -1 | 1) => void;
  onSelect: (path: string) => void;
}

/** Message key (under `context.picker`) of the mark each skip reason shows. */
const MARK_KEY: Record<ProjectContextSkipReason, string> = {
  missing: "missing",
  unreadable: "unreadable",
  outside_clone: "outsideClone",
  too_large: "tooLarge",
  over_budget: "overBudget",
};

export function DocPicker({
  documents,
  attached,
  effective,
  truncated,
  counter,
  selectedPath,
  onToggle,
  onMove,
  onSelect,
}: DocPickerProps) {
  const t = useTranslations("context");
  const [query, setQuery] = React.useState("");

  const allRows = React.useMemo(
    () => buildRows({ documents, attached, effective }),
    [documents, attached, effective],
  );
  const rows = filterRows(allRows, query);
  const totalTokens = sumTokens(effective);
  const overBudget = totalTokens > SECTION_TOKEN_BUDGET;

  return (
    <div style={s.wrap}>
      {counter && (
        <div style={s.counter} className="tnum" data-testid="doc-counter">
          {counter}
        </div>
      )}
      <div style={s.search}>
        <Icon.Search size={13} style={s.searchIcon} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("picker.search")}
          aria-label={t("picker.search")}
          style={s.searchInput}
        />
      </div>

      {truncated && <div style={s.notice}>{t("truncated")}</div>}

      {allRows.length > 0 && rows.length === 0 && <div style={s.empty}>{t("picker.noMatch")}</div>}

      <ul style={s.list}>
        {rows.map((row) => {
          const shown = visiblePath(row.path);
          return (
            <li key={row.path} style={s.row(row.path === selectedPath)} data-testid={`doc-row-${row.path}`}>
              {row.kind === "skill" ? (
                <span style={s.checkboxSpacer} />
              ) : (
                <Checkbox
                  checked={row.kind === "attached"}
                  ariaLabel={t("picker.attach", { path: shown })}
                  onChange={(on) => onToggle(row.path, on)}
                />
              )}
              <button type="button" className="mono" style={s.pathBtn} onClick={() => onSelect(row.path)}>
                {shown}
              </button>
              {row.tag && <Badge>{t(`tag.${row.tag}`)}</Badge>}
              {row.reason && <span style={s.mark}>{t(`picker.${MARK_KEY[row.reason]}`)}</span>}
              {row.kind === "skill" && (
                <span style={s.via}>{t("picker.viaSkill", { name: row.skillName ?? "" })}</span>
              )}
              {row.kind === "attached" && (
                <span style={s.moveGroup}>
                  <IconBtn
                    icon="ArrowUp"
                    size={24}
                    label={t("picker.moveUp", { path: shown })}
                    onClick={() => onMove(row.path, -1)}
                  />
                  <IconBtn
                    icon="ArrowDown"
                    size={24}
                    label={t("picker.moveDown", { path: shown })}
                    onClick={() => onMove(row.path, 1)}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <div style={s.footer} className="tnum">
        {t("picker.footer", { tokens: totalTokens })}
      </div>
      {overBudget && (
        <div style={s.notice} role="status" data-testid="doc-budget-warning">
          {t("picker.budgetWarning", { budget: SECTION_TOKEN_BUDGET })}
        </div>
      )}
    </div>
  );
}
