import { ALLOWED_EXTENSIONS, MAX_ISSUES, MAX_SPEC_FILES } from './constants.js';

/**
 * Pure: pull issue numbers and file paths out of a PR description.
 *
 * Issues only via a closing keyword (`closes|fixes|resolves #N`) or a same-repo
 * `https://github.com/<owner>/<name>/issues/N` URL; a bare `#N` is not a link.
 * Files only from relative Markdown links, backticked paths and same-repo
 * `/blob/<ref>/<path>` URLs, reduced to a path; `.md` only. Nothing here
 * fetches anything.
 */

export interface References {
  issues: number[];
  files: string[];
}

const KEYWORD_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,9})\b/gi;
const ISSUE_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d{1,9})\b/gi;
const BLOB_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/\s)]+\/([^\s)#?"'`>]+)/gi;
const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const BACKTICKED = /`([^`\s]+)`/g;

/** Normalised relative `.md` path, or null when it must not be read. */
export function normalizeRelPath(raw: string): string | null {
  let p = raw.trim();
  if (!p || p.includes('\\') || /[\x00-\x1f\x7f]/.test(p)) return null;
  p = p.split('#')[0]!.split('?')[0]!;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return null; // any URL scheme
  if (p.startsWith('/')) return null; // absolute
  if (p.startsWith('./')) p = p.slice(2);
  const segs = p.split('/');
  if (segs.some((s) => s === '..' || s === '' || s === '.')) return null;
  const lower = p.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return null;
  return segs.join('/');
}

export function parseReferences(
  description: string | null | undefined,
  repo: { owner: string; name: string },
): References {
  const text = description ?? '';
  const issues: number[] = [];
  const files: string[] = [];
  const sameRepo = (o: string, n: string) =>
    o.toLowerCase() === repo.owner.toLowerCase() && n.toLowerCase() === repo.name.toLowerCase();

  const addIssue = (n: number) => {
    if (n > 0 && !issues.includes(n)) issues.push(n);
  };
  const addFile = (raw: string) => {
    const p = normalizeRelPath(raw);
    if (p && !files.includes(p)) files.push(p);
  };

  for (const m of text.matchAll(KEYWORD_ISSUE)) addIssue(Number(m[1]));
  for (const m of text.matchAll(ISSUE_URL)) {
    if (sameRepo(m[1]!, m[2]!)) addIssue(Number(m[3]));
  }
  for (const m of text.matchAll(BLOB_URL)) {
    if (!sameRepo(m[1]!, m[2]!)) continue;
    try {
      addFile(decodeURIComponent(m[3]!));
    } catch {
      /* malformed % escape → not a reference */
    }
  }
  for (const m of text.matchAll(MD_LINK)) addFile(m[1]!);
  for (const m of text.matchAll(BACKTICKED)) addFile(m[1]!);

  return { issues: issues.slice(0, MAX_ISSUES), files: files.slice(0, MAX_SPEC_FILES) };
}
