import type { SmartDiffRole } from '@devdigest/shared';
import { FALLBACK_ROLE, MATCH_RULES } from './constants.js';

/**
 * Path → Smart Diff role. Pure: the path is the only input, nothing is read
 * from disk, network, clock or container. Patterns live in ./constants.
 */

type Matcher = (segments: readonly string[]) => boolean;

/** `*` → any run of characters within one segment; everything else literal. */
function globToRegExp(glob: string): RegExp {
  const body = glob
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]*');
  return new RegExp(`^${body}$`);
}

function compile(pattern: string): Matcher {
  // `**/a/b/**` → directory run at any depth.
  if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
    const run = pattern.slice(3, -3).split('/');
    return (segments) => {
      const dirs = segments.slice(0, -1);
      for (let i = 0; i + run.length <= dirs.length; i++) {
        if (run.every((seg, j) => dirs[i + j] === seg)) return true;
      }
      return false;
    };
  }
  // `name/**` → anchored at the repository root.
  if (pattern.endsWith('/**')) {
    const head = pattern.slice(0, -3).split('/');
    return (segments) =>
      segments.length > head.length && head.every((seg, j) => segments[j] === seg);
  }
  // `**/glob` or `glob` → basename at any depth.
  const re = globToRegExp(pattern.startsWith('**/') ? pattern.slice(3) : pattern);
  return (segments) => re.test(segments[segments.length - 1] ?? '');
}

const COMPILED = MATCH_RULES.map((rule) => ({
  role: rule.role,
  matchers: rule.patterns.map(compile),
}));

export function classifyFile(path: string): SmartDiffRole {
  const segments = path.split('/');
  for (const { role, matchers } of COMPILED) {
    if (matchers.some((m) => m(segments))) return role;
  }
  return FALLBACK_ROLE;
}
