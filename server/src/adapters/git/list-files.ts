import { readdir } from 'node:fs/promises';

interface ListOptions {
  accept(relPath: string): boolean;
  skipDirs: readonly string[];
  limit: number;
  maxEntries: number;
}

/**
 * Depth-first walk of `root`, each directory's entries sorted by name (code-unit
 * order). Real directories are entered unless named in `skipDirs`; a symlinked
 * directory is never entered. A symlink is listed only when `acceptLink` (which
 * proves it is a file inside the root) says so. Stops after `limit` accepted
 * paths or `maxEntries` visited entries and reports `truncated`.
 */
export async function listFiles(
  root: string,
  opts: ListOptions,
  acceptLink: (relPath: string) => Promise<boolean>,
): Promise<{ paths: string[]; truncated: boolean }> {
  const paths: string[] = [];
  let visited = 0;
  let truncated = false;
  const skip = new Set(opts.skipDirs);

  // Returns true when the walk must stop.
  const walk = async (rel: string): Promise<boolean> => {
    const entries = await readdir(rel === '' ? root : `${root}/${rel}`, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (++visited > opts.maxEntries) {
        truncated = true;
        return true;
      }
      const childRel = rel === '' ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        if (await walk(childRel)) return true;
        continue;
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue;
      if (!opts.accept(childRel)) continue;
      if (entry.isSymbolicLink() && !(await acceptLink(childRel))) continue;
      if (paths.length >= opts.limit) {
        truncated = true;
        return true;
      }
      paths.push(childRel);
    }
    return false;
  };

  await walk('');
  return { paths, truncated };
}
