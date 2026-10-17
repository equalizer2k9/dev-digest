/* CostBreakdown — cost by agent and by model: a donut plus its own legend (amount, share, and
   the unpriced line with no amount). The cost is an estimate from token prices, never billing,
   so the block carries the badge (NFR-5). Presentational. */
"use client";

import { useTranslations } from "next-intl";
import { Badge, Donut } from "@devdigest/ui";
import type { PerfCostBreakdown } from "@devdigest/shared";
import { donutSegments, legendLines } from "./helpers";
import { s } from "./styles";

const COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--info)", "var(--sugg)", "var(--crit)"] as const;

function Part({
  title,
  breakdown,
  total,
  unknownKey,
}: {
  title: string;
  breakdown: PerfCostBreakdown;
  total: number | null;
  unknownKey: "breakdown.unknownModel" | "table.deletedAgent";
}) {
  const t = useTranslations("agentPerformance");
  const segments = donutSegments(breakdown, COLORS, t(unknownKey));
  const legend = legendLines(breakdown, total, t, unknownKey, COLORS);
  return (
    <section aria-label={title} style={s.part}>
      <div style={s.partTitle}>{title}</div>
      <div style={s.body}>
        {segments.length > 0 && <Donut segments={segments} legend={false} />}
        <div style={s.legend}>
          {legend.length === 0 && <span style={s.muted}>{t("breakdown.noCost")}</span>}
          {legend.map((l, i) => (
            <div key={i} style={s.legendRow}>
              {l.color && <span style={{ ...s.swatch, background: l.color }} />}
              <span style={s.label}>{l.label}</span>
              {l.amount !== null && (
                <span className="mono tnum" style={s.amount}>
                  {l.amount}
                </span>
              )}
              {l.share !== null && (
                <span className="tnum" style={s.share}>
                  {l.share}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CostBreakdown({
  byAgent,
  byModel,
  total,
}: {
  byAgent: PerfCostBreakdown;
  byModel: PerfCostBreakdown;
  total: number | null;
}) {
  const t = useTranslations("agentPerformance");
  return (
    <section aria-label={t("breakdown.title")} style={s.wrap}>
      <div style={s.head}>
        <h2 style={s.title}>{t("breakdown.title")}</h2>
        <Badge>{t("costBadge")}</Badge>
      </div>
      <div style={s.parts}>
        <Part title={t("breakdown.byAgent")} breakdown={byAgent} total={total} unknownKey="table.deletedAgent" />
        <Part title={t("breakdown.byModel")} breakdown={byModel} total={total} unknownKey="breakdown.unknownModel" />
      </div>
    </section>
  );
}
