import { isAbsolute, resolve, sep } from 'node:path';
import { realpath } from 'node:fs/promises';

/**
 * Thrown when a path would leave the clone. Detect with `isPathEscape`; the
 * message names the path, so never surface it to a client.
 */
export class PathEscapeError extends Error {
  readonly code = 'PATH_ESCAPE';
  constructor(rel: string) {
    super(`path escapes the repository: ${rel}`);
    this.name = 'PathEscapeError';
  }
}

export const isPathEscape = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'PATH_ESCAPE';

/**
 * Resolve `rel` inside `root` and prove it stays there. Rejects absolute paths,
 * `..` segments, NUL bytes and symlinks that leave the root. Returns the real
 * path to read. A missing file surfaces as the usual ENOENT from `realpath`.
 */
export async function confinePath(root: string, rel: string): Promise<string> {
  if (rel.includes('\0') || isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    throw new PathEscapeError(rel);
  }
  const rootReal = await realpath(root);
  const target = await realpath(resolve(rootReal, rel));
  if (target !== rootReal && !target.startsWith(rootReal + sep)) {
    throw new PathEscapeError(rel);
  }
  return target;
}
