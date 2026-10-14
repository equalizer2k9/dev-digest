import type { ProjectContextTag } from '@devdigest/shared';
import { DOCUMENT_ROOTS, IGNORED_SEGMENTS, MAX_PATH_CHARS } from './constants.js';

const HAS_CONTROL = /\p{Cc}/u;

/**
 * The one matcher for "project-context document": a `.md` file (case-sensitive)
 * with a `specs`, `docs` or `insights` directory among its segments. The
 * outermost root wins (`docs/specs/a.md` is `docs`). Purely lexical: a path
 * that is absolute, climbs (`..`, `.`), has an empty segment or a control
 * character, or passes through `.git` / `node_modules` is not a document.
 */
export function documentTag(path: string): ProjectContextTag | null {
  if (path.length === 0 || path.length > MAX_PATH_CHARS || HAS_CONTROL.test(path)) return null;
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  if (segments.some((s) => IGNORED_SEGMENTS.includes(s))) return null;
  const file = segments[segments.length - 1]!;
  if (!file.endsWith('.md') || file.length <= 3) return null;
  for (const seg of segments.slice(0, -1)) {
    const root = DOCUMENT_ROOTS.find((r) => r === seg);
    if (root) return root;
  }
  return null;
}

export interface SkillDocs {
  id: string;
  name: string;
  enabled: boolean;
  paths: string[];
}

/**
 * An agent's effective documents: its own first (stored order), then each
 * enabled skill's in the given order. A repeated path appears once, at its first
 * position, keeping the `skill` of that position.
 */
export function effectiveDocuments(
  own: string[],
  skills: SkillDocs[],
): { path: string; skill: { id: string; name: string } | null }[] {
  const seen = new Set<string>();
  const out: { path: string; skill: { id: string; name: string } | null }[] = [];
  const add = (path: string, skill: { id: string; name: string } | null) => {
    if (seen.has(path)) return;
    seen.add(path);
    out.push({ path, skill });
  };
  for (const p of own) add(p, null);
  for (const s of skills) {
    if (!s.enabled) continue;
    for (const p of s.paths) add(p, { id: s.id, name: s.name });
  }
  return out;
}

/** Does a block of `blockTokens` still fit once `used` tokens are spent? */
export const withinBudget = (used: number, blockTokens: number, budget: number): boolean =>
  used + blockTokens <= budget;
