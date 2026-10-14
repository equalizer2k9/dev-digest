import { MAX_DIFF_CELLS } from "./constants";

/** One rendered line of a version diff. */
export type DiffOp = "add" | "remove" | "context";

export interface DiffLine {
  op: DiffOp;
  text: string;
}

/**
 * Line-level diff of an old skill body against the current one, computed in the
 * browser — the API returns bodies, not patches.
 *
 * Classic LCS: `context` lines survive in both, `remove` lines exist only in
 * `before` (the older version), `add` lines only in `after` (the current body).
 * The table is O(n·m), so a pathologically large pair degrades to a plain
 * replace-everything diff rather than locking the tab up.
 */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  if (n * m > MAX_DIFF_CELLS) {
    return [
      ...a.map((text): DiffLine => ({ op: "remove", text })),
      ...b.map((text): DiffLine => ({ op: "add", text })),
    ];
  }

  // dp[i][j] = length of the LCS of a[i..] and b[j..].
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: "context", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      out.push({ op: "remove", text: a[i]! });
      i++;
    } else {
      out.push({ op: "add", text: b[j]! });
      j++;
    }
  }
  while (i < n) out.push({ op: "remove", text: a[i++]! });
  while (j < m) out.push({ op: "add", text: b[j++]! });
  return out;
}

/** True when the two bodies are byte-identical (nothing to show in the diff). */
export function isIdentical(lines: DiffLine[]): boolean {
  return lines.every((l) => l.op === "context");
}
