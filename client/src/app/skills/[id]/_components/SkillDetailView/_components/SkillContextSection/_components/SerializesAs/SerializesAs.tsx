/* SerializesAs — read-only preview of how the skill's attached documents enter
   the prompt: grouped by tag in prompt order, each with path and tokens, and a
   mark on the ones past the section budget. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { ProjectContextDocument } from "@devdigest/shared";
import { visiblePath } from "@/lib/visible-path";
import { serializeGroups } from "./helpers";
import { s } from "./styles";

export interface SerializesAsProps {
  attached: string[];
  documents: ProjectContextDocument[];
}

export function SerializesAs({ attached, documents }: SerializesAsProps) {
  const t = useTranslations("context");
  const groups = React.useMemo(() => serializeGroups(attached, documents), [attached, documents]);

  return (
    <div style={s.wrap} data-testid="serializes-as">
      <div style={s.title}>{t("serializes.title")}</div>
      {groups.length === 0 && <div style={s.empty}>{t("serializes.empty")}</div>}
      {groups.map((g) => (
        <div key={g.tag} style={s.group} data-testid={`serializes-group-${g.tag}`}>
          <Badge>{t(`tag.${g.tag}`)}</Badge>
          <ul style={s.list}>
            {g.docs.map((d) => (
              <li key={d.path} style={s.item} data-testid={`serializes-doc-${d.path}`}>
                <span className="mono" style={s.path}>
                  {visiblePath(d.path)}
                </span>
                <span className="tnum" style={s.tokens}>
                  {t("serializes.tokens", { tokens: d.tokens })}
                </span>
                {d.overBudget && <span style={s.mark}>{t("serializes.overBudget")}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
