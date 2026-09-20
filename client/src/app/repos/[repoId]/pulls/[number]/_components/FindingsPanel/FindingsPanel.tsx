/* FindingsPanel — severity counters, a severity filter, hide-low-confidence,
   j/k navigation and the FindingCard list, wiring the accept/dismiss hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Chip, Icon, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { FILTER_SEVERITIES, KEY_TO_ACTION } from "./constants";
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
  // always equals the number of rows its severity chip shows.
  const counts = React.useMemo(
    () => severityCounts(visibleFindings(findings, hideLow)),
    [findings, hideLow],
  );
  // The filter in effect, DERIVED rather than synced: a severity that is not on
  // offer (e.g. hideLow just removed the last CRITICAL) simply does not apply, so
  // the panel can never sit on an unreachable empty list. Deriving it also means
  // the chip never lights up for a frame before an effect takes it back.
  const active = counts.some(([sev]) => sev === severity) ? severity : null;

  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, active),
    [findings, hideLow, active],
  );

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
          <div style={s.counterRow} role="group" aria-label={t("panel.severityCounters")}>
            {counts.map(([sev, n]) => {
              const tok = SEV[sev as Severity];
              const SevIcon = Icon[tok.icon];
              return (
                <span
                  key={sev}
                  data-severity={sev}
                  style={{ ...s.counterPill, color: tok.c, borderBottom: `1px dotted ${tok.c}` }}
                >
                  <SevIcon size={12.5} />
                  <span className="tnum">{n}</span>
                </span>
              );
            })}
          </div>
        )}

        <div style={s.filterRow}>
          <div style={s.filterGroup} role="group" aria-label={t("panel.severityFilter")}>
            {FILTER_SEVERITIES.map((sev) => (
              <Chip
                key={sev}
                active={active === sev}
                onClick={() => selectSeverity(sev)}
                icon={SEV[sev].icon}
                color={SEV[sev].c}
              >
                {SEV[sev].label}
              </Chip>
            ))}
          </div>

          <div style={s.divider} />

          <div style={s.toggleGroup}>
            {t("panel.hideLowConfidence")}
            <Toggle on={hideLow} onChange={setHideLow} size={16} />
          </div>
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
