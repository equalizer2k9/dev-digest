/* FindingsPanel — severity counters + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SeverityBadge, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { severityCounts, visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<string | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);

  // Counts ignore the severity filter but honour hideLow, so a counter's number
  // always equals the number of rows you get by clicking it.
  const counts = React.useMemo(
    () => severityCounts(visibleFindings(findings, hideLow)),
    [findings, hideLow],
  );
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );

  // Drop a filter whose severity is no longer on offer (e.g. hideLow just removed
  // the last CRITICAL) — otherwise the panel sits on an unreachable empty list.
  React.useEffect(() => {
    if (severity && !counts.some(([sev]) => sev === severity)) setSeverity(null);
  }, [counts, severity]);

  const selectSeverity = React.useCallback((sev: string) => {
    setSeverity((cur) => (cur === sev ? null : sev));
    setFocusIdx(0); // j/k indexes into the visible list, which just changed length.
  }, []);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        {counts.length > 0 && (
          <>
            <div style={s.counterRow} role="group" aria-label={t("panel.severityCounters")}>
              {counts.map(([sev, n]) => {
                const selected = severity === sev;
                return (
                  <button
                    key={sev}
                    onClick={() => selectSeverity(sev)}
                    aria-pressed={selected}
                    aria-label={
                      selected
                        ? t("panel.showAllSeverities")
                        : t("panel.showOnlySeverity", {
                            severity: SEV[sev as Severity]?.label ?? sev,
                          })
                    }
                    style={{
                      ...s.counterButton,
                      ...(selected ? s.counterButtonActive : {}),
                      ...(severity && !selected ? s.counterButtonMuted : {}),
                    }}
                  >
                    <SeverityBadge severity={sev as Severity} count={n} />
                  </button>
                );
              })}
            </div>
            <div style={s.divider} />
          </>
        )}

        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
