import type { UnifiedDiff } from '@devdigest/shared';
import {
  MAX_HUNK_HEADER_CHARS,
  MAX_OUTLINE_CHARS,
  MAX_OUTLINE_FILES,
  MAX_OUTLINE_HUNKS_PER_FILE,
} from './constants.js';

/**
 * Pure: the changed-file outline fed to the intent classifier — per file
 * `path (+a/-d)` followed by the raw `@@ … @@` header lines of its hunks.
 * A hunk body line (`+`, `-`, context) never enters the outline: the raw diff
 * is scanned for `@@` lines only, and each is cut to the header cap.
 */
export function buildFileOutline(diff: UnifiedDiff): string {
  const headersByFile = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of diff.raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      current = m ? m[2]! : null;
    } else if (current && line.startsWith('@@')) {
      const list = headersByFile.get(current) ?? [];
      list.push(line.slice(0, MAX_HUNK_HEADER_CHARS));
      headersByFile.set(current, list);
    }
  }

  const out: string[] = [];
  for (const f of diff.files.slice(0, MAX_OUTLINE_FILES)) {
    out.push(`${f.path} (+${f.additions}/-${f.deletions})`);
    const headers = headersByFile.get(f.path) ?? [];
    for (const h of headers.slice(0, MAX_OUTLINE_HUNKS_PER_FILE)) out.push(`  ${h}`);
    if (headers.length > MAX_OUTLINE_HUNKS_PER_FILE) {
      out.push(`  … ${headers.length - MAX_OUTLINE_HUNKS_PER_FILE} more hunk(s)`);
    }
  }
  if (diff.files.length > MAX_OUTLINE_FILES) {
    out.push(`… ${diff.files.length - MAX_OUTLINE_FILES} more file(s)`);
  }
  return out.join('\n').slice(0, MAX_OUTLINE_CHARS);
}
