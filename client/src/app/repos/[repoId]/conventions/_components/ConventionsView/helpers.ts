/** Pure helpers for ConventionsView. */

import type { ConventionCandidate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { REPO_NOT_INDEXED_CODE } from "./constants";

/** How many of the visible candidates the user has accepted. */
export function acceptedCount(candidates: ConventionCandidate[]): number {
  return candidates.filter((c) => c.status === "accepted").length;
}

export interface RelativeScan {
  /** i18n key suffix under `scan.ago.*`. */
  unit: "now" | "minutes" | "hours" | "days";
  n: number;
}

/**
 * Split an ISO timestamp into the unit + amount the `scan.ago.*` messages take,
 * so the wording stays in `messages/en/conventions.json` and not in the code.
 */
export function relativeScan(iso: string, now: number = Date.now()): RelativeScan {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return { unit: "now", n: 0 };
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return { unit: "now", n: 0 };
  if (minutes < 60) return { unit: "minutes", n: minutes };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { unit: "hours", n: hours };
  return { unit: "days", n: Math.round(hours / 24) };
}

/**
 * The `repo_not_indexed` guard (server spec §2) — the one scan failure that
 * renders inline under the header instead of as a full `ErrorState`.
 *
 * The API answers it as `{ error: { code, message } }`, which `api.ts` lifts
 * onto `ApiError.code`, so that is what is matched. A 409 that carries no code
 * at all still counts: it is the only conflict this route documents, and losing
 * the inline hint would be worse than reading a future sibling 409 as this one.
 */
export function isRepoNotIndexed(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code === REPO_NOT_INDEXED_CODE) return true;
  return err.status === 409 && !err.code;
}

/**
 * The server's own message for an error, or null when `api.ts` only had the bare
 * status line to fall back on (`"409 Conflict"`) — then the caller shows its own
 * translated copy instead.
 */
export function serverMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  return /^\d{3}\b/.test(err.message) ? null : err.message;
}
