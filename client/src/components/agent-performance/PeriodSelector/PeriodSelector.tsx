/* PeriodSelector — calendar button offering 1 day / 30 days / Custom. Custom reveals two date
   inputs and an Apply that stays disabled while the range is incomplete or reversed. The
   value lives in the caller (the URL); this component only reports the user's choice. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { PeriodParams } from "@/lib/agent-performance";
import { s } from "./styles";

export function PeriodSelector({ value, onChange }: { value: PeriodParams; onChange: (p: PeriodParams) => void }) {
  const t = useTranslations("agentPerformance");
  const [customOpen, setCustomOpen] = React.useState(value.period === "custom");
  const [from, setFrom] = React.useState(value.period === "custom" ? value.from : "");
  const [to, setTo] = React.useState(value.period === "custom" ? value.to : "");
  const valid = from !== "" && to !== "" && from <= to;

  const current =
    value.period === "1d" ? t("period.oneDay") : value.period === "30d" ? t("period.thirtyDays") : t("period.custom");

  return (
    <div style={s.wrap}>
      <Dropdown
        align="right"
        width={170}
        trigger={
          <Button kind="secondary" icon="Calendar" iconRight="ChevronDown" aria-label={t("period.button")}>
            {current}
          </Button>
        }
        items={[
          {
            label: t("period.oneDay"),
            onClick: () => {
              setCustomOpen(false);
              onChange({ period: "1d" });
            },
          },
          {
            label: t("period.thirtyDays"),
            onClick: () => {
              setCustomOpen(false);
              onChange({ period: "30d" });
            },
          },
          { label: t("period.custom"), onClick: () => setCustomOpen(true) },
        ]}
      />
      {customOpen && (
        <div style={s.custom}>
          <label style={s.field}>
            {t("period.from")}
            <input type="date" style={s.input} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={s.field}>
            {t("period.to")}
            <input type="date" style={s.input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <Button
            kind="primary"
            disabled={!valid}
            onClick={() => valid && onChange({ period: "custom", from, to })}
          >
            {t("period.apply")}
          </Button>
        </div>
      )}
    </div>
  );
}
