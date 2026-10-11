import type { SmartDiff, SmartDiffFile } from '@devdigest/shared';
import { classifyFile } from './classify-file.js';
import { DISPLAY_ORDER } from './constants.js';

/**
 * PR files + the findings that count → the SmartDiff document. Pure: no model,
 * no I/O. Always five groups in display order; a role with no files is `files: []`.
 */
export function buildSmartDiff(
  files: readonly { path: string; additions: number; deletions: number }[],
  findings: readonly { file: string; startLine: number }[],
): SmartDiff {
  const linesByFile = new Map<string, Set<number>>();
  for (const f of findings) {
    const lines = linesByFile.get(f.file) ?? new Set<number>();
    lines.add(f.startLine);
    linesByFile.set(f.file, lines);
  }

  const byRole = new Map(DISPLAY_ORDER.map((role) => [role, [] as SmartDiffFile[]]));
  let totalLines = 0;
  for (const f of files) {
    totalLines += f.additions + f.deletions;
    byRole.get(classifyFile(f.path))!.push({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      finding_lines: [...(linesByFile.get(f.path) ?? [])].sort((a, b) => a - b),
    });
  }

  return {
    groups: DISPLAY_ORDER.map((role) => ({
      role,
      files: byRole.get(role)!.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    })),
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}
