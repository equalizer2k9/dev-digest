/* AgentColumns — one column per agent run: status, duration, tokens, cost, findings, score.
   "View trace" opens one RunTraceDrawer at a time (a live stream only for an in-progress run).
   Every value is rendered as a React text node. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button } from "@devdigest/ui";
import type { MultiRunAgent } from "@devdigest/shared";
import RunTraceDrawer from "@/components/run-trace/RunTraceDrawer";
import { useCancelRun } from "@/lib/hooks/reviews";
import { isInProgress } from "@/lib/hooks/multi-agent";
import { formatCost, formatDuration } from "@/components/multi-agent";
import { statusKey } from "./helpers";
import { s } from "./styles";

export interface AgentColumnsProps {
  agents: MultiRunAgent[];
  prNumber: number;
}

export function AgentColumns({ agents, prNumber }: AgentColumnsProps) {
  const t = useTranslations("multiAgent");
  const cancel = useCancelRun();
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const selected = agents.find((a) => a.run_id === selectedRunId) ?? null;
  const dash = t("picker.dash");

  return (
    <>
      <div style={s.grid}>
        {agents.map((a) => {
          const name = a.agent_name ?? t("column.deletedAgent");
          const running = isInProgress(a.status);
          return (
            <div key={a.run_id} style={s.column} data-run-id={a.run_id}>
              <div style={s.head}>
                <span style={s.name}>{name}</span>
                <Badge>{t(`column.status.${statusKey(a.status)}`)}</Badge>
              </div>
              <div style={s.stat}>
                <span>{t("column.duration")}</span>
                <span className="tnum">{formatDuration(a.duration_ms, dash)}</span>
              </div>
              <div style={s.stat}>
                <span>{t("column.tokens")}</span>
                <span className="tnum">
                  {a.tokens_in == null && a.tokens_out == null
                    ? dash
                    : `${a.tokens_in ?? 0} / ${a.tokens_out ?? 0}`}
                </span>
              </div>
              <div style={s.stat}>
                <span>{t("column.cost")}</span>
                <span className="tnum">{formatCost(a.cost_usd, dash)}</span>
              </div>
              <div style={s.stat}>
                <span>{t("column.findings")}</span>
                <span className="tnum">{a.findings_count ?? dash}</span>
              </div>
              <div style={s.stat}>
                <span>{t("column.score")}</span>
                <span className="tnum">{a.score ?? dash}</span>
              </div>
              {a.error && <div style={s.error}>{a.error}</div>}
              <div style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setSelectedRunId(a.run_id)}>
                  {t("column.viewTrace")}
                </Button>
                {running && (
                  <Button
                    kind="secondary"
                    size="sm"
                    disabled={cancel.isPending}
                    onClick={() => cancel.mutate(a.run_id)}
                  >
                    {t("column.cancel")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {selected && (
        <RunTraceDrawer
          runId={selected.run_id}
          agentName={selected.agent_name ?? t("column.deletedAgent")}
          prNumber={prNumber}
          running={isInProgress(selected.status)}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </>
  );
}
