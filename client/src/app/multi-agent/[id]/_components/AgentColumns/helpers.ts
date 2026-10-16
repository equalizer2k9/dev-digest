/** Pure helpers for AgentColumns. */

const KNOWN = ["queued", "running", "done", "failed", "cancelled"] as const;

/** Message key (under `column.status`) for a run status. */
export function statusKey(status: string | null): (typeof KNOWN)[number] | "unknown" {
  return (KNOWN as readonly string[]).includes(status ?? "")
    ? (status as (typeof KNOWN)[number])
    : "unknown";
}
