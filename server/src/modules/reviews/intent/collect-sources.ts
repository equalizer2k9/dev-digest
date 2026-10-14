import type { IntentSource, RepoRef, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { MAX_DESCRIPTION_CHARS, MAX_SPEC_FILE_BYTES, MAX_SPEC_FILE_CHARS } from './constants.js';
import { isFileTooLarge } from '../../../adapters/file-too-large.js';
import { buildFileOutline } from './file-outline.js';
import { parseReferences } from './parse-references.js';

/**
 * I/O half of the intent classifier input. Resolves the issues and plan / spec
 * files a PR description points at, and records for every part whether it was
 * used, missing or skipped. Only the PR's own repo is ever touched: issues
 * through `GitHubClient.getIssue`, files through the clone (head commit first),
 * then GitHub contents API at the head sha, then the clone's working tree. No
 * URL from PR text is ever requested.
 */

export interface CollectedSources {
  issues: { number: number; title: string; body: string }[];
  files: { path: string; content: string }[];
  /** Pre-rendered `path (+a/-d)` + `@@` header lines. */
  outline: string;
  sources: IntentSource[];
}

export interface CollectInput {
  container: Container;
  repo: RepoRef;
  pull: { title: string; body: string | null; headSha: string };
  diff: UnifiedDiff;
}

const TOO_LARGE = Symbol('too_large');

export async function collectSources(input: CollectInput): Promise<CollectedSources> {
  const { container, repo, pull, diff } = input;
  const sources: IntentSource[] = [{ kind: 'pr_title', ref: 'title', status: 'used' }];

  const body = pull.body?.trim() ? pull.body.trim().slice(0, MAX_DESCRIPTION_CHARS) : '';
  if (body) {
    sources.push({ kind: 'pr_description', ref: 'description', status: 'used' });
  } else {
    sources.push({
      kind: 'pr_description',
      ref: 'description',
      status: 'missing',
      reason: pull.body === null ? 'not_synced' : 'empty',
    });
  }

  const refs = parseReferences(body, repo);

  const issues: CollectedSources['issues'] = [];
  for (const n of refs.issues) {
    const ref = `#${n}`;
    try {
      const gh = await container.github();
      const issue = await gh.getIssue(repo, n);
      if (issue.is_pull_request) {
        sources.push({ kind: 'linked_issue', ref, status: 'skipped', reason: 'is_pull_request' });
        continue;
      }
      issues.push({
        number: n,
        title: issue.title,
        body: (issue.body ?? '').slice(0, MAX_DESCRIPTION_CHARS),
      });
      sources.push({ kind: 'linked_issue', ref, status: 'used' });
    } catch {
      sources.push({ kind: 'linked_issue', ref, status: 'missing', reason: 'fetch_failed' });
    }
  }

  // Refused references are recorded, never read.
  for (const r of refs.rejected) {
    sources.push({ kind: 'spec_file', ref: r.ref, status: 'skipped', reason: r.reason });
  }

  const files: CollectedSources['files'] = [];
  for (const path of refs.files) {
    const text = await readSpec(container, repo, pull.headSha, path);
    if (text === null) {
      sources.push({ kind: 'spec_file', ref: path, status: 'missing', reason: 'not_found' });
    } else if (text === TOO_LARGE || text.length > MAX_SPEC_FILE_CHARS) {
      sources.push({ kind: 'spec_file', ref: path, status: 'skipped', reason: 'too_large' });
    } else {
      files.push({ path, content: text });
      sources.push({ kind: 'spec_file', ref: path, status: 'used' });
    }
  }

  const outline = buildFileOutline(diff);
  sources.push(
    diff.files.length > 0
      ? { kind: 'changed_files', ref: `${diff.files.length} file(s)`, status: 'used' }
      : { kind: 'changed_files', ref: '0 file(s)', status: 'missing', reason: 'no_changes' },
  );

  return { issues, files, outline, sources };
}

/**
 * Text of `path` from the PR's own repo, or null when no source has it (an empty
 * file counts as missing). Order: head commit in the clone → GitHub contents
 * API at the head sha → the clone's working tree.
 */
async function readSpec(
  container: Container,
  repo: RepoRef,
  headSha: string,
  path: string,
): Promise<string | typeof TOO_LARGE | null> {
  const nonEmpty = (s: string | null | undefined) => (s && s.trim().length > 0 ? s : null);

  try {
    const t = nonEmpty(await container.git.readFileAtRef(repo, headSha, path, MAX_SPEC_FILE_BYTES));
    if (t !== null) return t;
  } catch (err) {
    if (isFileTooLarge(err)) return TOO_LARGE;
    /* clone lacks the commit or the path → next source */
  }
  try {
    const gh = await container.github();
    const t = nonEmpty(await gh.getFileContent(repo, path, headSha, MAX_SPEC_FILE_BYTES));
    if (t !== null) return t;
  } catch (err) {
    if (isFileTooLarge(err)) return TOO_LARGE;
    /* no token / network / 404 → next source */
  }
  try {
    return nonEmpty(await container.git.readFile(repo, path, MAX_SPEC_FILE_BYTES));
  } catch (err) {
    return isFileTooLarge(err) ? TOO_LARGE : null;
  }
}
