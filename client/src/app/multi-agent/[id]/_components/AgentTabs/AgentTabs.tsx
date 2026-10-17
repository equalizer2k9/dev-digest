/* AgentTabs — the Tabs view of /multi-agent/:id (design v7 "Tabs + detail"): one tab per agent run
   with its status, duration, tokens, cost, score, "View trace" and its full findings list through
   FindingCard. Tab switching is local state over data already loaded; it issues no request.
   Every value is rendered as a React text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState } from "@devdigest/ui";
import type { FindingGroup, MultiRunAgent } from "@devdigest/shared";
import { FindingCard } from "@/components/findings/FindingCard";
import { EvalCaseButton } from "@/components/eval/EvalCaseButton";
import RunTraceDrawer from "@/components/run-trace/RunTraceDrawer";
import { formatDuration } from "@/components/multi-agent";
import { formatCost } from "@/lib/cost";
import { isInProgress, useMultiRunFindingAction } from "@/lib/hooks/multi-agent";
import { useCancelRun } from "@/lib/hooks/reviews";
import { statusKey } from "../AgentColumns/helpers";
import { conflictFindingIds, runFindings } from "./helpers";
import { s } from "./styles";

export interface AgentTabsProps {
  agents: MultiRunAgent[];
  groups: FindingGroup[];
  prNumber: number;
  multiRunId: string;
}

export function AgentTabs({ agents, groups, prNumber, multiRunId }: AgentTabsProps) {
  const t = useTranslations("multiAgent");
  const action = useMultiRunFindingAction(multiRunId);
  const cancel = useCancelRun();
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [traceOpen, setTraceOpen] = React.useState(false);
  const dash = t("picker.dash");

  const active = agents.find((a) => a.run_id === activeRunId) ?? agents[0];
  if (!active) return <EmptyState icon="Cpu" title={t("tabs.noAgents")} />;

  const nameOf = (a: MultiRunAgent) => a.agent_name ?? t("column.deletedAgent");
  const findings = runFindings(groups, active.run_id);
  const conflicts = conflictFindingIds(groups);
  const running = isInProgress(active.status);

  return (
    <div>
      <div role="tablist" aria-label={t("tabs.label")} style={s.bar}>
        {agents.map((a) => {
          const on = a.run_id === active.run_id;
          return (
            <button
              key={a.run_id}
              type="button"
              role="tab"
              id={`tab-${a.run_id}`}
              aria-selected={on}
              aria-controls={`panel-${a.run_id}`}
              style={s.tab(on)}
              onClick={() => setActiveRunId(a.run_id)}
            >
              <span>{nameOf(a)}</span>
              <span className="tnum" style={s.tabScore}>{a.score ?? dash}</span>
            </button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${active.run_id}`} aria-labelledby={`tab-${active.run_id}`} style={s.panel}>
        <div style={s.summary}>
          <span style={s.name}>{nameOf(active)}</span>
          <Badge>{t(`column.status.${statusKey(active.status)}`)}</Badge>
          <div style={s.stats}>
            <span>
              {t("column.duration")}
              <span className="tnum" style={s.statValue}>{formatDuration(active.duration_ms, dash)}</span>
            </span>
            <span>
              {t("column.tokens")}
              <span className="tnum" style={s.statValue}>
                {active.tokens_in == null && active.tokens_out == null
                  ? dash
                  : `${active.tokens_in ?? 0} / ${active.tokens_out ?? 0}`}
              </span>
            </span>
            <span>
              {t("column.cost")}
              <span className="tnum" style={s.statValue}>{formatCost(active.cost_usd, dash)}</span>
            </span>
            <span>
              {t("column.score")}
              <span className="tnum" style={s.statValue}>{active.score ?? dash}</span>
            </span>
          </div>
          <div style={s.actions}>
            <Button kind="secondary" size="sm" onClick={() => setTraceOpen(true)}>
              {t("column.viewTrace")}
            </Button>
            {running && (
              <Button
                kind="secondary"
                size="sm"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(active.run_id)}
              >
                {t("column.cancel")}
              </Button>
            )}
          </div>
        </div>
        {active.error && <div style={s.error}>{active.error}</div>}
        {findings.length === 0 ? (
          <EmptyState icon="Filter" title={t("tabs.noFindings")} />
        ) : (
          <div style={s.list}>
            {findings.map((f) => (
              <div key={f.id}>
                {conflicts.has(f.id) && (
                  <div style={s.conflict}>
                    <Badge color="var(--warn)" bg="var(--warn-bg)">{t("disagree.conflict")}</Badge>
                  </div>
                )}
                <FindingCard
                  f={f}
                  pending={action.isPending}
                  extraAction={<EvalCaseButton finding={f} />}
                  onAction={(act, reply) => action.mutate({ findingId: f.id, action: act, reply })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {traceOpen && (
        <RunTraceDrawer
          runId={active.run_id}
          agentName={nameOf(active)}
          prNumber={prNumber}
          findings={findings}
          running={running}
          onClose={() => setTraceOpen(false)}
        />
      )}
    </div>
  );
}
