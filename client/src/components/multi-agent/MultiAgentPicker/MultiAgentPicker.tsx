/* MultiAgentPicker — choose 2 to 5 enabled agents, each with its estimated cost and time, plus the
   total. Presentational: no data hooks; the PR page and /multi-agent feed it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import type { AgentEstimate } from "@devdigest/shared";
import { canLaunch, formatCost, formatDuration, toggle, totalEstimate } from "./helpers";
import { MIN_AGENTS } from "./constants";
import { s } from "./styles";

export interface MultiAgentPickerProps {
  estimates: AgentEstimate[] | undefined;
  loading: boolean;
  selected: string[];
  onChange: (ids: string[]) => void;
  onLaunch: () => void;
  launching: boolean;
  error: string | null;
}

export function MultiAgentPicker({
  estimates,
  loading,
  selected,
  onChange,
  onLaunch,
  launching,
  error,
}: MultiAgentPickerProps) {
  const t = useTranslations("multiAgent");
  const [capHit, setCapHit] = React.useState(false);
  const list = estimates ?? [];
  const dash = t("picker.dash");
  const total = totalEstimate(list, selected);

  const onTick = (id: string) => {
    const next = toggle(selected, id);
    setCapHit(next === selected);
    if (next !== selected) onChange(next);
  };

  return (
    <div style={s.root}>
      <div style={s.title}>{t("picker.title")}</div>
      {loading ? (
        <div style={s.hint}>{t("picker.loading")}</div>
      ) : list.length === 0 ? (
        <div style={s.hint}>{t("picker.none")}</div>
      ) : (
        <div style={s.list}>
          {list.map((e) => (
            <Checkbox
              key={e.agent_id}
              checked={selected.includes(e.agent_id)}
              onChange={() => onTick(e.agent_id)}
              label={
                <span style={s.rowLabel}>
                  <span style={s.name}>{e.agent_name}</span>
                  <span className="tnum" style={s.estimate}>
                    {t("picker.estimate", {
                      cost: formatCost(e.cost_usd, dash),
                      time: formatDuration(e.duration_ms, dash),
                    })}
                  </span>
                </span>
              }
            />
          ))}
        </div>
      )}
      <div className="tnum" style={s.total}>
        {t("picker.total", {
          cost: formatCost(total.cost_usd, dash),
          time: formatDuration(total.duration_ms, dash),
        })}
      </div>
      {capHit && <div style={s.hint}>{t("picker.max")}</div>}
      {!loading && list.length < MIN_AGENTS && <div style={s.hint}>{t("picker.needTwo")}</div>}
      {error && <div style={s.error}>{error}</div>}
      <div style={s.actions}>
        <Button
          kind="primary"
          size="md"
          onClick={onLaunch}
          loading={launching}
          disabled={!canLaunch(selected.length) || launching}
        >
          {t("picker.launch", { count: selected.length })}
        </Button>
      </div>
    </div>
  );
}
