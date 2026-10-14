import type {
  ProjectContextDocument,
  ProjectContextEffective,
  ProjectContextSkipReason,
  ProjectContextTag,
} from "@devdigest/shared";

/** One line of the picker. `attached` rows are the owner's own, in stored order. */
export interface PickerRow {
  path: string;
  kind: "attached" | "skill" | "other";
  /** Null for an attached path that is no longer in the listing. */
  tag: ProjectContextTag | null;
  tokens: number | null;
  /** Why the document is not (fully) in the prompt; null when it is. */
  reason: ProjectContextSkipReason | null;
  /** Set on `skill` rows: the skill that brings the document. */
  skillName?: string;
}

/** Move the item at `from` to index `to`, returning a new array (same array when a no-op). */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items;
  next.splice(to, 0, moved);
  return next;
}

/**
 * A path for display: control and format characters (newline, zero-width, bidi
 * override) are written as a visible `\\u{hex}` escape, so a file name cannot
 * reorder or hide text. Display only — selection and writes use the real path.
 */
export const visiblePath = (path: string) =>
  path.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (ch) => `\\u{${ch.codePointAt(0)!.toString(16)}}`);

/** Attached rows first, then skill-only rows, then every other listed document. */
export function buildRows(input: {
  documents: ProjectContextDocument[];
  attached: string[];
  effective: ProjectContextEffective[];
}): PickerRow[] {
  const { documents, attached, effective } = input;
  const byPath = new Map(documents.map((d) => [d.path, d]));
  const effByPath = new Map<string, ProjectContextEffective>();
  for (const e of effective) if (!effByPath.has(e.path)) effByPath.set(e.path, e);

  const make = (path: string, kind: PickerRow["kind"]): PickerRow => {
    const d = byPath.get(path);
    const e = effByPath.get(path);
    return {
      path,
      kind,
      tag: d?.tag ?? null,
      tokens: e ? e.tokens : (d?.tokens ?? null),
      reason: e?.skip_reason ?? (d?.too_large ? "too_large" : null),
      ...(kind === "skill" && e?.skill ? { skillName: e.skill.name } : {}),
    };
  };

  const own = new Set(attached);
  const rows: PickerRow[] = attached.map((p) => make(p, "attached"));
  const viaSkill = new Set<string>();
  for (const e of effective) {
    if (e.skill && !own.has(e.path) && !viaSkill.has(e.path)) {
      viaSkill.add(e.path);
      rows.push(make(e.path, "skill"));
    }
  }
  for (const d of documents) {
    if (!own.has(d.path) && !viaSkill.has(d.path)) rows.push(make(d.path, "other"));
  }
  return rows;
}

/** Case-insensitive path substring filter. */
export function filterRows(rows: PickerRow[], query: string): PickerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.path.toLowerCase().includes(q));
}

/** Sum of the effective documents' tokens, `null` counting as 0. */
export function sumTokens(entries: { tokens: number | null }[]): number {
  return entries.reduce((n, e) => n + (e.tokens ?? 0), 0);
}
