import type { CiRunRow } from "@devdigest/shared";

const DASH = "—";

/** "8s" / "1m 15s"; null → dash. */
export function formatDuration(seconds: number | null): string {
  if (seconds == null) return DASH;
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  return `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** USD with 3 decimals; null → dash (an unpriced run is not $0.00). */
export function formatCost(usd: number | null): string {
  return usd == null ? DASH : `$${usd.toFixed(3)}`;
}

const STATUS_KEYS: Record<string, string> = {
  succeeded: "runs.status.succeeded",
  no_findings: "runs.status.noFindings",
  failed: "runs.status.failed",
  running: "runs.status.running",
};

/** Message key for a status, or null when the value is not one we know. */
export function statusKey(status: CiRunRow["status"]): string | null {
  return status ? (STATUS_KEYS[status] ?? null) : null;
}

export const STATUS_COLORS: Record<string, { color: string; bg: string }> = {
  succeeded: { color: "var(--ok)", bg: "var(--ok-bg)" },
  no_findings: { color: "var(--ok)", bg: "var(--ok-bg)" },
  failed: { color: "var(--crit)", bg: "var(--crit-bg)" },
  running: { color: "var(--info)", bg: "var(--info-bg)" },
};

/** The link target comes from an untrusted artifact: only https URLs become anchors. */
export function isHttpsUrl(url: string): boolean {
  return url.startsWith("https://");
}
