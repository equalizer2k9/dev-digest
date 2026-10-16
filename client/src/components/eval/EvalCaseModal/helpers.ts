import type { EvalCaseEdit } from "@devdigest/shared";

export const NAME_MAX = 200;

export type EditError = "nameEmpty" | "nameTooLong" | "lineInvalid" | "startMin" | "startAfterEnd";

/** A whole number from an input string, or null. */
export function parseLine(v: string): number | null {
  return /^\d+$/.test(v.trim()) ? Number(v.trim()) : null;
}

/** Client mirror of the server's checks (AC-47): trimmed name 1..200, start >= 1, start <= end. */
export function validateEdit(
  name: string,
  start: string,
  end: string,
): { edit: EvalCaseEdit; error: null } | { edit: null; error: EditError } {
  const trimmed = name.trim();
  if (!trimmed) return { edit: null, error: "nameEmpty" };
  if (trimmed.length > NAME_MAX) return { edit: null, error: "nameTooLong" };
  const a = parseLine(start);
  const b = parseLine(end);
  if (a === null || b === null) return { edit: null, error: "lineInvalid" };
  if (a < 1) return { edit: null, error: "startMin" };
  if (a > b) return { edit: null, error: "startAfterEnd" };
  return { edit: { name: trimmed, start_line: a, end_line: b }, error: null };
}

export interface FragmentLine {
  kind: "hunk" | "add" | "del" | "ctx";
  text: string;
  /** Inside the zone, by the new file's line number. Removed lines have none and never light up. */
  highlighted: boolean;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

/**
 * The hunks of a one-file diff that meet the zone [start, end] (new-file lines), with the lines inside
 * the zone marked. A null zone (the inputs are mid-edit) keeps every hunk, unmarked.
 */
export function diffFragment(
  diff: string,
  zone: { start: number; end: number } | null,
): FragmentLine[] {
  const hunks: { meets: boolean; lines: FragmentLine[] }[] = [];
  let cur: { meets: boolean; lines: FragmentLine[] } | null = null;
  let newLine = 0;
  for (const raw of diff.split("\n")) {
    const m = HUNK.exec(raw);
    if (m) {
      const first = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      const meets = zone === null || (count > 0 && first <= zone.end && first + count - 1 >= zone.start);
      cur = { meets, lines: [{ kind: "hunk", text: raw, highlighted: false }] };
      hunks.push(cur);
      newLine = first;
      continue;
    }
    if (!cur) continue; // file headers before the first hunk
    if (raw.startsWith("\\")) {
      cur.lines.push({ kind: "ctx", text: raw, highlighted: false });
    } else if (raw.startsWith("-")) {
      cur.lines.push({ kind: "del", text: raw, highlighted: false });
    } else if (raw.startsWith("+") || raw.startsWith(" ")) {
      const inZone = zone !== null && newLine >= zone.start && newLine <= zone.end;
      cur.lines.push({ kind: raw.startsWith("+") ? "add" : "ctx", text: raw, highlighted: inZone });
      newLine++;
    }
    // blank trailing line: ignored
  }
  return hunks.filter((h) => h.meets).flatMap((h) => h.lines);
}
