import { unzipSync } from 'fflate';
import { CiResultArtifact, type CiRunRow, type WorkflowRunInfo } from '@devdigest/shared';
import { ARTIFACT_FILE, ARTIFACT_MAX_BYTES } from './constants.js';

/**
 * Reading a CI result artifact and mapping CI runs to API rows. Pure.
 * The artifact is untrusted: enumerate the archive first, inflate only the one
 * known entry, cap its size and re-check the decoded length.
 */

export type ArtifactReadResult =
  | { ok: true; data: CiResultArtifact }
  | { ok: false; reason: 'bad_archive' | 'invalid_result' };

export function readResultArtifact(zip: Uint8Array): ArtifactReadResult {
  let size: number | undefined;
  try {
    unzipSync(zip, {
      filter: (file) => {
        if (file.name === ARTIFACT_FILE) size = file.originalSize;
        return false;
      },
    });
  } catch {
    return { ok: false, reason: 'bad_archive' };
  }
  if (size === undefined || size > ARTIFACT_MAX_BYTES) return { ok: false, reason: 'bad_archive' };

  let bytes: Uint8Array | undefined;
  try {
    bytes = unzipSync(zip, { filter: (file) => file.name === ARTIFACT_FILE })[ARTIFACT_FILE];
  } catch {
    return { ok: false, reason: 'bad_archive' };
  }
  if (!bytes || bytes.length > ARTIFACT_MAX_BYTES) return { ok: false, reason: 'bad_archive' };

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    return { ok: false, reason: 'invalid_result' };
  }
  const parsed = CiResultArtifact.safeParse(json);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, reason: 'invalid_result' };
}

export type ArtifactSkipReason = 'no_pull_request' | 'pr_mismatch' | 'agent_mismatch';

/** Does the artifact belong to this run and this installation's agent? null = yes. */
export function checkArtifact(
  data: CiResultArtifact,
  run: WorkflowRunInfo,
  agentName: string,
): ArtifactSkipReason | null {
  if (run.pr_number === null) return 'no_pull_request';
  if (data.pr_number == null || data.pr_number !== run.pr_number) return 'pr_mismatch';
  if (data.agent !== agentName) return 'agent_mismatch';
  return null;
}

export function ciStatusFor(conclusion: string | null, findings: number): 'succeeded' | 'failed' | 'no_findings' {
  if (conclusion !== 'success') return 'failed';
  return findings === 0 ? 'no_findings' : 'succeeded';
}

/** `owner/name` from `https://github.com/<owner>/<name>/actions/runs/<id>`. */
export function repoFromRunUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/\d+/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** One listed CI run as the repository returns it (joined across the four tables, D-1). */
export interface CiRunDbRow {
  id: string;
  installationRepo: string | null;
  prNumber: number | null;
  agentId: string | null;
  agentName: string | null;
  status: string | null;
  findingsCount: number | null;
  costUsd: number | null;
  durationMs: number | null;
  ranAt: Date | null;
  githubUrl: string | null;
}

export function toCiRunRow(r: CiRunDbRow): CiRunRow {
  return {
    id: r.id,
    repo: r.installationRepo ?? repoFromRunUrl(r.githubUrl),
    pr_number: r.prNumber,
    agent_id: r.agentId,
    agent: r.agentName,
    status: r.status,
    findings_count: r.findingsCount,
    cost_usd: r.costUsd,
    duration_s: r.durationMs === null ? null : r.durationMs / 1000,
    ran_at: r.ranAt ? r.ranAt.toISOString() : null,
    github_url: r.githubUrl,
  };
}

/** Stable sort by `ran_at` descending, nulls last. */
export function newestFirst(rows: CiRunRow[]): CiRunRow[] {
  const t = (r: CiRunRow) => (r.ran_at ? Date.parse(r.ran_at) : Number.NEGATIVE_INFINITY);
  return [...rows].sort((a, b) => {
    const ta = t(a);
    const tb = t(b);
    return ta === tb ? 0 : tb > ta ? 1 : -1;
  });
}
