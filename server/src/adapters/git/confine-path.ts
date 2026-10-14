import { isAbsolute, relative, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { PathEscapeError } from '@devdigest/shared';

/**
 * Resolve `rel` inside `root` and prove it stays there. Rejects absolute paths,
 * `..` segments, NUL bytes and symlinks that leave the root. Returns the real
 * path to read. A missing file surfaces as the usual ENOENT from `realpath`.
 */
export async function confinePath(
  root: string,
  rel: string,
  /** Optional extra rule on the REAL path, relative to the root with `/` separators. */
  acceptReal?: (realRel: string) => boolean,
): Promise<string> {
  if (rel.includes('\0') || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new PathEscapeError(rel);
  }
  const rootReal = await realpath(root);
  const target = await realpath(resolve(rootReal, rel));
  if (target !== rootReal && !target.startsWith(rootReal + sep)) {
    throw new PathEscapeError(rel);
  }
  if (acceptReal && !acceptReal(relative(rootReal, target).split(sep).join('/'))) {
    throw new PathEscapeError(rel);
  }
  return target;
}
