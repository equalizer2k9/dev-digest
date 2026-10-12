import { ALLOWED_EXTENSIONS, MAX_ISSUES, MAX_REJECTED_REFS, MAX_REJECTED_REF_CHARS, MAX_SPEC_FILES } from './constants.js';

/**
 * Pure: pull issue numbers and file paths out of a PR description.
 *
 * Issues only via a closing keyword (`closes|fixes|resolves #N`) or a same-repo
 * `https://github.com/<owner>/<name>/issues/N` URL; a bare `#N` is not a link.
 * Files only from relative Markdown links, backticked paths and same-repo
 * `/blob/<ref>/<path>` URLs, reduced to a path; `.md` only. Nothing here
 * fetches anything.
 */

export type RejectReason = 'absolute_path' | 'path_traversal' | 'not_markdown' | 'invalid_path';

/** A file reference that matched a pattern but must never be read. */
export interface RejectedRef {
  /** Safe display form: control characters removed, length-capped. Never read. */
  ref: string;
  reason: RejectReason;
}

export interface References {
  issues: number[];
  files: string[];
  /** Up to MAX_REJECTED_REFS refused file references, in order of appearance. */
  rejected: RejectedRef[];
}

const KEYWORD_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+#(\d{1,9})\b/gi;
const ISSUE_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d{1,9})\b/gi;
const BLOB_URL = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/[^/\s)]+\/([^\s)#?"'`>]+)/gi;
const MD_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
const BACKTICKED = /`([^`\s]+)`/g;

/** Display-safe form of a refused reference: no control chars, capped. */
function displayRef(raw: string): string {
  const clean = raw.replace(/[\x00-\x1f\x7f]/g, '').trim();
  return clean.length > MAX_REJECTED_REF_CHARS
    ? `${clean.slice(0, MAX_REJECTED_REF_CHARS - 3)}...`
    : clean;
}

/** Normalised relative `.md` path, or the reason it must not be read. */
export function classifyPath(raw: string): { path: string } | { reason: RejectReason } {
  let p = raw.trim();
  if (!p || p.includes('\\') || /[\x00-\x1f\x7f]/.test(p)) return { reason: 'invalid_path' };
  p = p.split('#')[0]!.split('?')[0]!;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('//')) return { reason: 'invalid_path' }; // any URL scheme
  if (p.startsWith('/')) return { reason: 'absolute_path' };
  if (p.startsWith('./')) p = p.slice(2);
  const segs = p.split('/');
  if (segs.some((s) => s === '..')) return { reason: 'path_traversal' };
  if (segs.some((s) => s === '' || s === '.')) return { reason: 'invalid_path' };
  const lower = p.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return { reason: 'not_markdown' };
  return { path: segs.join('/') };
}

/** Normalised relative `.md` path, or null when it must not be read. */
export function normalizeRelPath(raw: string): string | null {
  const r = classifyPath(raw);
  return 'path' in r ? r.path : null;
}

/** Looks like a file (has a short extension) — gates which backticked text counts as a reference. */
const HAS_EXTENSION = /\.[A-Za-z][A-Za-z0-9]{0,7}$/;

export function parseReferences(
  description: string | null | undefined,
  repo: { owner: string; name: string },
): References {
  const text = description ?? '';
  const issues: number[] = [];
  const files: string[] = [];
  const rejected: RejectedRef[] = [];
  const sameRepo = (o: string, n: string) =>
    o.toLowerCase() === repo.owner.toLowerCase() && n.toLowerCase() === repo.name.toLowerCase();

  const addIssue = (n: number) => {
    if (n > 0 && !issues.includes(n)) issues.push(n);
  };
  const addFile = (raw: string, kind: 'link' | 'backtick' | 'blob') => {
    const r = classifyPath(raw);
    if ('path' in r) {
      if (!files.includes(r.path)) files.push(r.path);
      return;
    }
    // Ordinary backticked text (`foo`, `a b`) is not a file reference; only
    // something that looks like a path with an extension is recorded as refused.
    if (kind === 'backtick' && !HAS_EXTENSION.test(raw.split('#')[0]!.split('?')[0]!)) return;
    // A backticked code path (`src/a.ts`) is how a description names code, not a spec link.
    if (kind === 'backtick' && r.reason === 'not_markdown') return;
    if (kind === 'link' && /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(raw.trim())) return; // URLs and anchors are not file refs
    if (rejected.length >= MAX_REJECTED_REFS) return;
    const ref = displayRef(raw);
    if (!ref || rejected.some((x) => x.ref === ref)) return;
    rejected.push({ ref, reason: r.reason });
  };

  for (const m of text.matchAll(KEYWORD_ISSUE)) addIssue(Number(m[1]));
  for (const m of text.matchAll(ISSUE_URL)) {
    if (sameRepo(m[1]!, m[2]!)) addIssue(Number(m[3]));
  }
  for (const m of text.matchAll(BLOB_URL)) {
    if (!sameRepo(m[1]!, m[2]!)) continue;
    try {
      addFile(decodeURIComponent(m[3]!), 'blob');
    } catch {
      /* malformed % escape → not a reference */
    }
  }
  for (const m of text.matchAll(MD_LINK)) addFile(m[1]!, 'link');
  for (const m of text.matchAll(BACKTICKED)) addFile(m[1]!, 'backtick');

  return { issues: issues.slice(0, MAX_ISSUES), files: files.slice(0, MAX_SPEC_FILES), rejected };
}
