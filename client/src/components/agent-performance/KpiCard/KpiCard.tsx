/* KpiCard — one dashboard tile: label, value (or "—" when absent), caption and an optional badge.
   Presentational; an absent value is the dash, never a zero. */
import type { ReactNode } from "react";
import { s } from "./styles";

export function KpiCard({
  label,
  value,
  caption,
  badge,
}: {
  label: string;
  value: string | null;
  caption?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div style={s.card}>
      <span style={s.label}>{label}</span>
      <span className="tnum" style={s.value}>
        {value ?? "—"}
      </span>
      {caption && <span style={s.caption}>{caption}</span>}
      {badge && <span style={s.badge}>{badge}</span>}
    </div>
  );
}
