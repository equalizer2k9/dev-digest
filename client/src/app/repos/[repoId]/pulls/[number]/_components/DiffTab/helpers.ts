import type { PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

export interface RoleFiles {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Join the smart-diff response to the PR's files by `path`. Group and file
 * order come from the response; a response path with no `PrFile` is skipped,
 * and a `PrFile` the response does not mention goes to `rest` (never dropped).
 */
export function groupFiles(
  groups: SmartDiffGroup[],
  files: PrFile[],
): { groups: RoleFiles[]; rest: PrFile[] } {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const used = new Set<string>();
  const out = groups.map((g) => {
    const list: PrFile[] = [];
    for (const sf of g.files) {
      const file = byPath.get(sf.path);
      if (!file || used.has(sf.path)) continue;
      used.add(sf.path);
      list.push(file);
    }
    return { role: g.role, files: list };
  });
  return { groups: out, rest: files.filter((f) => !used.has(f.path)) };
}

/**
 * Paths the smart-diff response marks as having findings (`finding_lines`
 * non-empty). The one source for the file-card dot and the group counter.
 */
export function pathsWithFindings(groups: SmartDiffGroup[]): Set<string> {
  const out = new Set<string>();
  for (const g of groups) {
    for (const f of g.files) if (f.finding_lines.length > 0) out.add(f.path);
  }
  return out;
}

/** How many of these files are in the set (a file counts once). */
export function countFilesWithFindings(files: PrFile[], withFindings: ReadonlySet<string>): number {
  return files.filter((f) => withFindings.has(f.path)).length;
}
