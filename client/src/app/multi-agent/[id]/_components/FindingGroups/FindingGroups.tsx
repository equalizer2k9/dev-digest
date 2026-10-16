/* FindingGroups — group rows (representative + the agents that flagged it) that expand to one
   FindingCard per member. Titles and rationales are rendered as text nodes only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, SeverityBadge } from "@devdigest/ui";
import type { FindingGroup, MultiRunAgent } from "@devdigest/shared";
import { FindingCard } from "@/app/repos/[repoId]/pulls/[number]/_components/FindingCard";
import { EvalCaseButton } from "@/app/repos/[repoId]/pulls/[number]/_components/EvalCaseButton";
import { useMultiRunFindingAction } from "@/lib/hooks/multi-agent";
import { groupAgentNames, locationLabel } from "./helpers";
import { s } from "./styles";

export interface FindingGroupsProps {
  groups: FindingGroup[];
  agents: MultiRunAgent[];
  multiRunId: string;
}

export function FindingGroups({ groups, agents, multiRunId }: FindingGroupsProps) {
  const t = useTranslations("multiAgent");
  const action = useMultiRunFindingAction(multiRunId);
  const [open, setOpen] = React.useState<Set<string>>(new Set());

  if (groups.length === 0) return <EmptyState icon="Filter" title={t("groups.empty")} />;

  const flip = (id: string) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <div style={s.list}>
      {groups.map((g) => {
        const expanded = open.has(g.id);
        const rep = g.representative;
        return (
          <div key={g.id} style={s.row} data-group-id={g.id}>
            <button
              type="button"
              style={s.head}
              aria-expanded={expanded}
              aria-label={`${expanded ? t("groups.collapse") : t("groups.expand")}: ${rep.title}`}
              onClick={() => flip(g.id)}
            >
              <SeverityBadge severity={rep.severity} />
              <span style={s.title}>{rep.title}</span>
              <span className="mono" style={s.meta}>{locationLabel(rep)}</span>
              <span style={s.meta}>
                {t("groups.agentsLabel")}: {groupAgentNames(g.members, agents, t("column.deletedAgent")).join(", ")}
              </span>
            </button>
            {expanded && (
              <div style={s.members}>
                {g.members.map((m) => (
                  <FindingCard
                    key={m.id}
                    f={m}
                    defaultExpanded
                    pending={action.isPending}
                    extraAction={<EvalCaseButton finding={m} />}
                    onAction={(act, reply) =>
                      action.mutate({ findingId: m.id, action: act, reply })
                    }
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
