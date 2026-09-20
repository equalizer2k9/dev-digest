import React from "react";

/**
 * A timestamp as "3h" / "2d", with the exact moment one hover away.
 *
 *   <RelativeTime iso={pr.updated_at} />   → 3h   (title: 2026-09-20 11:04 UTC)
 *
 * Renders a real <time dateTime> so the machine-readable instant survives the
 * lossy short form. A null/unparseable value reads "—".
 *
 * The tooltip is formatted in UTC, not the viewer's locale: this element is
 * server-rendered and hydrated, and a locale/timezone-dependent string would
 * differ between the two. `suppressHydrationWarning` covers the remaining case
 * — a minute boundary crossed between render and hydration ("59m" → "1h").
 */
export function RelativeTime({
  iso,
  now,
  muted,
}: {
  iso: string | null | undefined;
  /** Reference instant, for tests and stories. Defaults to `Date.now()`. */
  now?: number;
  muted?: boolean;
}) {
  const ms = iso ? Date.parse(iso) : NaN;
  const style = { color: muted ? "var(--text-muted)" : "var(--text-secondary)" };
  if (Number.isNaN(ms)) return <span style={style}>—</span>;
  return (
    <time dateTime={iso!} title={formatAbsolute(ms)} style={style} suppressHydrationWarning>
      {formatRelativeTime(iso, now)}
    </time>
  );
}

/** Compact relative time for dense columns (e.g. "now", "3m", "7h", "2d"). */
export function formatRelativeTime(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  // Clamped at 0: a clock skewed a few seconds ahead should read "now", not "-1m".
  const m = Math.max(0, Math.round((now - then) / 60_000));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** The tooltip form: `2026-09-20 11:04 UTC` — stable across server and client. */
export function formatAbsolute(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
