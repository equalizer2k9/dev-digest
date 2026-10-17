/* agent-performance.ts — the Agent Performance period in the URL, and the money / rate / time
   formatters of that feature (SPEC-06). The period rules MIRROR `PerfPeriodQuery` of
   @devdigest/shared: the client takes only types from there, not zod values (see
   feature-models.ts). An invalid or partial URL period falls back to 30 days. */
import type { PerfPeriodPreset } from "@devdigest/shared";

const DASH = "—";

export type PeriodParams =
  | { period: Exclude<PerfPeriodPreset, "custom"> }
  | { period: "custom"; from: string; to: string };

const FALLBACK: PeriodParams = { period: "30d" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(v: string): boolean {
  if (!ISO_DATE.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export function parsePeriodParams(sp: { get(k: string): string | null }): PeriodParams {
  const period = sp.get("period");
  const from = sp.get("from");
  const to = sp.get("to");
  if (period === null) return FALLBACK;
  if (period === "1d" || period === "30d") return from === null && to === null ? { period } : FALLBACK;
  if (period === "custom") {
    if (from && to && isRealDate(from) && isRealDate(to) && from <= to) return { period, from, to };
  }
  return FALLBACK;
}

/** Query string of a period, e.g. `period=custom&from=2026-10-01&to=2026-10-10`. */
export function periodSearch(p: PeriodParams): string {
  return p.period === "custom" ? `period=custom&from=${p.from}&to=${p.to}` : `period=${p.period}`;
}

/** Replace the period in an existing query and keep the other params (e.g. `tab`). */
export function withPeriod(sp: { toString(): string }, p: PeriodParams): string {
  const q = new URLSearchParams(sp.toString());
  q.delete("period");
  q.delete("from");
  q.delete("to");
  const rest = q.toString();
  return rest ? `${rest}&${periodSearch(p)}` : periodSearch(p);
}

const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => MONTH_DAY.format(new Date(`${iso}T00:00:00.000Z`));

/** "1D" / "30D" / "Oct 1 – Oct 10"; `t` resolves `period.caption1d|caption30d`. */
export function periodCaption(p: PeriodParams, t: (key: string) => string): string {
  if (p.period === "custom") return `${shortDate(p.from)} – ${shortDate(p.to)}`;
  return p.period === "1d" ? t("period.caption1d") : t("period.caption30d");
}

/** USD: 2 decimals, 4 below one cent. Absent → dash, never "$0.00". */
export function formatUsd(n: number | null | undefined): string {
  if (n == null) return DASH;
  return n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

/** A 0..1 rate as a whole percentage. */
export function formatRate(n: number | null | undefined): string {
  return n == null ? DASH : `${Math.round(n * 100)}%`;
}

/** Seconds with one decimal; minutes above 60 s. */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return DASH;
  const s = ms / 1000;
  return s > 60 ? `${(s / 60).toFixed(1)} min` : `${s.toFixed(1)} s`;
}

const REL = new Intl.RelativeTimeFormat("en", { numeric: "always" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function formatRelative(iso: string | null | undefined, now: Date): string {
  if (!iso) return DASH;
  const diff = new Date(iso).getTime() - now.getTime();
  for (const [unit, ms] of STEPS) {
    if (Math.abs(diff) >= ms) return REL.format(Math.round(diff / ms), unit);
  }
  return REL.format(Math.round(diff / 1000), "second");
}

/** `2026-10-17 10:05 UTC` */
export function formatUtc(iso: string | null | undefined): string {
  if (!iso) return DASH;
  return `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
