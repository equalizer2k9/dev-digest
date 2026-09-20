/* SkillsTab — which skills this agent assembles, and in what order.

   Lists EVERY skill in the workspace, not just the linked ones: "enabled for
   this agent" ⇔ a row in `agent_skills`, so the toggle links or unlinks. Both
   writes — and every reorder — are the same call, `POST /agents/:id/skills`
   with the full ordered id list, because `order` is the array index.

   Reordering is native HTML5 drag-and-drop (no library, per the spec) with
   Move up / Move down buttons beside it, so the order is reachable from the
   keyboard and assertable in jsdom. Only enabled rows are draggable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, IconBtn, Skeleton, Toggle } from "@devdigest/ui";
import type { Agent, SkillWithUsage } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { SKILL_TYPE_COLOR } from "../../../../../../../lib/skill-types";
import { filterByName, moveItem, reorderById, splitRows } from "./helpers";
import { s } from "./styles";

export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const toast = useToast();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);

  const [search, setSearch] = React.useState("");
  const [order, setOrder] = React.useState<string[]>([]);
  const dragged = React.useRef<string | null>(null);

  const serverOrder = React.useMemo(
    () => [...(links ?? [])].sort((a, b) => a.order - b.order).map((l) => l.skill_id),
    [links],
  );
  // Adopt the server order whenever it actually changes (including after our
  // own write settles); local edits in between are the optimistic view.
  const serverKey = serverOrder.join("|");
  React.useEffect(() => {
    setOrder(serverOrder);
  }, [serverKey, agent.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Optimistically apply an order, then persist it; roll back on failure. */
  const write = (next: string[]) => {
    const previous = order;
    setOrder(next);
    setSkills.mutate(next, {
      onError: () => {
        setOrder(previous);
        toast.error(t("skills.reorderFailed"));
      },
    });
  };

  const all = skills ?? [];
  const { enabled, disabled } = splitRows(all, order);
  const visibleEnabled = filterByName(enabled, search);
  const visibleDisabled = filterByName(disabled, search);

  const toggle = (id: string, on: boolean) =>
    // Attaching appends at the end of the prompt order; detaching drops the id.
    write(on ? [...order, id] : order.filter((x) => x !== id));

  const move = (id: string, delta: -1 | 1) => {
    const from = order.indexOf(id);
    write(moveItem(order, from, from + delta));
  };

  const onDrop = (targetId: string) => {
    const from = dragged.current;
    dragged.current = null;
    if (!from || from === targetId) return;
    write(reorderById(order, from, targetId));
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
    );
  }
  if (isError) return <ErrorState body={t("skills.loadError")} onRetry={() => refetch()} />;

  const row = (sk: SkillWithUsage, isEnabled: boolean, index: number) => (
    <div
      key={sk.id}
      draggable={isEnabled}
      onDragStart={isEnabled ? () => (dragged.current = sk.id) : undefined}
      onDragOver={isEnabled ? (e) => e.preventDefault() : undefined}
      onDrop={isEnabled ? (e) => { e.preventDefault(); onDrop(sk.id); } : undefined}
      style={s.row(isEnabled)}
      data-testid={`skill-row-${sk.id}`}
    >
      {isEnabled ? (
        <span
          role="img"
          aria-label={t("skills.dragHandle", { name: sk.name })}
          data-testid={`drag-handle-${sk.id}`}
          style={s.handle}
        >
          <Icon.Menu size={14} />
        </span>
      ) : (
        <span style={s.handleSpacer} />
      )}

      <span style={s.name}>{sk.name}</span>
      <Badge color={SKILL_TYPE_COLOR[sk.type]} bg="var(--bg-hover)">
        {sk.type}
      </Badge>
      {!sk.enabled && <Badge color="var(--text-muted)">{t("skills.globallyDisabled")}</Badge>}

      {isEnabled && (
        <span style={s.moveGroup}>
          <IconBtn
            icon="ArrowUp"
            size={24}
            label={t("skills.moveUp", { name: sk.name })}
            onClick={() => move(sk.id, -1)}
          />
          <IconBtn
            icon="ArrowDown"
            size={24}
            label={t("skills.moveDown", { name: sk.name })}
            onClick={() => move(sk.id, 1)}
          />
        </span>
      )}

      <Toggle on={isEnabled} onChange={(on) => toggle(sk.id, on)} size={14} />
      <span style={s.orderIndex} className="tnum">
        {isEnabled ? index + 1 : ""}
      </span>
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <span style={s.count}>{t("skills.enabledCount", { linked: enabled.length, total: all.length })}</span>
        <div style={s.search}>
          <Icon.Search size={13} style={s.searchIcon} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("skills.searchPlaceholder")}
            aria-label={t("skills.searchPlaceholder")}
            style={s.searchInput}
          />
        </div>
      </div>

      <p style={s.orderHint}>{t("skills.orderHint")}</p>

      {all.length === 0 && <div style={s.empty}>{t("skills.empty")}</div>}
      {all.length > 0 && visibleEnabled.length === 0 && visibleDisabled.length === 0 && (
        <div style={s.empty}>{t("skills.noMatch")}</div>
      )}

      {visibleEnabled.length > 0 && (
        <>
          <div style={s.groupLabel}>{t("skills.enabledHeading")}</div>
          {visibleEnabled.map((sk) => row(sk, true, order.indexOf(sk.id)))}
        </>
      )}

      {visibleDisabled.length > 0 && (
        <>
          <div style={s.groupLabel}>{t("skills.disabledHeading")}</div>
          {visibleDisabled.map((sk) => row(sk, false, -1))}
        </>
      )}
    </div>
  );
}
