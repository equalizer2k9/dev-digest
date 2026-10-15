import { basename, extname } from 'node:path';

/** Segments a symlink target may never pass through: `.git/config` holds the clone token. */
const FORBIDDEN_SEGMENTS: readonly string[] = ['.git', 'node_modules'];

/**
 * The one `acceptReal` rule for every clone-file read that can reach a model
 * (`GitClient.readFile(repo, path, maxBytes, acceptReal)`). The symlink-resolved
 * target must avoid `.git` / `node_modules` AND satisfy `accept`, the same
 * constraint the caller applied to the requested path.
 */
export const resolvedTargetRule =
  (accept: (realRel: string) => boolean) =>
  (realRel: string): boolean =>
    !realRel.split('/').some((s) => FORBIDDEN_SEGMENTS.includes(s)) && accept(realRel);

/**
 * For callers with no extension constraint of their own: the target must be the
 * same kind of file as requested — same extension, or the same basename when
 * there is none (`.eslintrc` -> `.env` is refused).
 */
export const sameKindAs =
  (requested: string) =>
  (realRel: string): boolean => {
    const want = extname(requested) || basename(requested);
    return (extname(realRel) || basename(realRel)).toLowerCase() === want.toLowerCase();
  };
