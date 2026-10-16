/**
 * Pure finding grouping across agent runs (AC-9). Single-link, in input order:
 * a finding joins the FIRST group that has no member from its own run and has a
 * member in the same file with an overlapping line range and a similar title.
 */
import type { GroupMember } from '@devdigest/shared';
import { SEVERITY_RANK, SIMILARITY_THRESHOLD } from './constants.js';

export interface FindingSpan {
  start_line: number;
  end_line?: number | null | undefined;
}

export interface RawGroup {
  representative: GroupMember;
  members: GroupMember[];
}

/** Lower-cased unique words of a title (Unicode letters and digits). */
export function titleWords(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 0),
  );
}

/** Jaccard index of two titles' word sets; 0 when both are empty. */
export function titleSimilarity(a: string, b: string): number {
  const wa = titleWords(a);
  const wb = titleWords(b);
  if (wa.size === 0 && wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / (wa.size + wb.size - inter);
}

/** Inclusive overlap; a missing end_line means the span is just start_line. */
export function rangesOverlap(a: FindingSpan, b: FindingSpan): boolean {
  const aEnd = a.end_line ?? a.start_line;
  const bEnd = b.end_line ?? b.start_line;
  return a.start_line <= bEnd && b.start_line <= aEnd;
}

function matches(f: GroupMember, other: GroupMember, threshold: number): boolean {
  return (
    f.file === other.file &&
    rangesOverlap(f, other) &&
    titleSimilarity(f.title, other.title) >= threshold
  );
}

/** The caller passes finished runs only, in launch order. Never mutates input. */
export function groupFindings(
  runs: { runId: string; findings: GroupMember[] }[],
  threshold: number = SIMILARITY_THRESHOLD,
): RawGroup[] {
  const groups: { members: GroupMember[]; runIds: Set<string> }[] = [];
  for (const run of runs) {
    for (const f of run.findings) {
      const target = groups.find(
        (g) => !g.runIds.has(run.runId) && g.members.some((m) => matches(f, m, threshold)),
      );
      if (target) {
        target.members.push(f);
        target.runIds.add(run.runId);
      } else {
        groups.push({ members: [f], runIds: new Set([run.runId]) });
      }
    }
  }
  return groups.map((g) => {
    let rep = g.members[0]!;
    for (const m of g.members) {
      if (SEVERITY_RANK[m.severity] > SEVERITY_RANK[rep.severity]) rep = m;
    }
    return { representative: rep, members: [...g.members] };
  });
}
