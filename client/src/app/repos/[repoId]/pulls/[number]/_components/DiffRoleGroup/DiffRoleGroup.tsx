/* DiffRoleGroup — one smart-diff group: header (chevron, role label, hint,
   `● N` files with findings, `N files`) and, when open, its file cards.
   Presentational: the label/hint arrive translated, the cards as children. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SmartDiffRole } from "@devdigest/shared";
import { s, chevronFor, headerCursorFor } from "./styles";

export function DiffRoleGroup({
  role,
  label,
  hint,
  fileCount,
  filesWithFindings,
  defaultOpen = true,
  children,
}: {
  role: SmartDiffRole;
  label: string;
  hint: string;
  fileCount: number;
  /** Number of FILES in the group with at least one finding. */
  filesWithFindings: number;
  /** Docs and boilerplate start collapsed. */
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState(defaultOpen);
  const empty = fileCount === 0;
  const expanded = open && !empty;

  return (
    <section style={s.group}>
      <button
        type="button"
        data-role-group={role}
        aria-expanded={expanded}
        disabled={empty}
        onClick={() => setOpen((o) => !o)}
        style={{ ...s.header, ...headerCursorFor(empty) }}
      >
        <Icon.ChevronRight size={13} style={chevronFor(expanded, empty)} />
        <span style={s.label}>{label}</span>
        <span style={s.hint}>{hint}</span>
        {filesWithFindings > 0 && (
          <span
            data-findings-count=""
            className="tnum"
            style={s.findings}
            aria-label={t("smartDiff.filesWithFindings", { count: filesWithFindings })}
          >
            ● {filesWithFindings}
          </span>
        )}
        <span className="tnum" style={s.count}>
          {t("smartDiff.filesCount", { count: fileCount })}
        </span>
      </button>
      {expanded && <div style={s.body}>{children}</div>}
    </section>
  );
}
