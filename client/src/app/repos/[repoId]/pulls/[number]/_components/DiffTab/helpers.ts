import type { FindingRecord, PrFile, SmartDiffGroup, SmartDiffRole } from "@devdigest/shared";

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

/** Index findings by the file they point at. */
export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const out = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = out.get(f.file) ?? [];
    list.push(f);
    out.set(f.file, list);
  }
  return out;
}

/** How many of these files have at least one finding (a file counts once). */
export function countFilesWithFindings(
  files: PrFile[],
  byPath: Map<string, FindingRecord[]>,
): number {
  return files.filter((f) => (byPath.get(f.path)?.length ?? 0) > 0).length;
}
