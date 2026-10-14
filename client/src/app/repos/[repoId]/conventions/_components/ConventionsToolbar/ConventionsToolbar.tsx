/* ConventionsToolbar — bulk accept/deselect, the accepted counter, and the entry
   point to the create-skill modal. `Create skill` is rendered ONLY while at least
   one candidate is accepted: at zero it is absent from the DOM, not disabled. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export interface ConventionsToolbarProps {
  /** Visible candidates (pending + accepted) — the `m` in "{n} of {m}". */
  total: number;
  acceptedCount: number;
  busy?: boolean;
  onAcceptAll: () => void;
  onDeselectAll: () => void;
  onCreateSkill: () => void;
}

export function ConventionsToolbar({
  total,
  acceptedCount,
  busy,
  onAcceptAll,
  onDeselectAll,
  onCreateSkill,
}: ConventionsToolbarProps) {
  const t = useTranslations("conventions");
  const allAccepted = total > 0 && acceptedCount === total;

  return (
    <div style={s.bar}>
      <Button
        kind="ghost"
        size="sm"
        icon={allAccepted ? "X" : "Check"}
        disabled={busy || total === 0}
        onClick={allAccepted ? onDeselectAll : onAcceptAll}
      >
        {allAccepted ? t("toolbar.deselectAll") : t("toolbar.acceptAll")}
      </Button>
      <span style={s.count}>{t("toolbar.count", { n: acceptedCount, m: total })}</span>
      {acceptedCount > 0 && (
        <div style={s.right}>
          <Button kind="primary" size="sm" icon="Sparkles" onClick={onCreateSkill}>
            {t("toolbar.createSkill")}
          </Button>
        </div>
      )}
    </div>
  );
}
