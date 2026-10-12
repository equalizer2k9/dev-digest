import { isAbsolute, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';

/**
 * Resolve `rel` inside `root` and prove it stays there. Rejects absolute paths,
 * `..` segments, NUL bytes and symlinks that leave the root. Returns the real
 * path to read. A missing file surfaces as the usual ENOENT from `realpath`.
 */
export async function confinePath(root: string, rel: string): Promise<string> {
  if (rel.includes('\0') || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new Error(`path escapes the repository: ${rel}`);
  }
  const rootReal = await realpath(root);
  const target = await realpath(resolve(rootReal, rel));
  if (target !== rootReal && !target.startsWith(rootReal + sep)) {
    throw new Error(`path escapes the repository: ${rel}`);
  }
  return target;
}
