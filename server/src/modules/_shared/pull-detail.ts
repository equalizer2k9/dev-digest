import { eq } from 'drizzle-orm';
import type { PrDetail } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';

/**
 * Refresh a PR's detail from GitHub and persist it: replaces `pr_files` and
 * `pr_commits`, backfills body + diff stats on `pull_requests`. Shared by
 * `GET /pulls/:id` and `GET /pulls/:id/blast` so there is exactly one copy.
 *
 * THROWS when GitHub is unavailable (no token / offline / API error) — callers
 * decide how to degrade (serve the persisted rows).
 */
export async function refreshPullDetailFromGitHub(
  container: Container,
  pr: Pick<PullRow, 'id' | 'number'>,
  repo: { owner: string; name: string },
): Promise<PrDetail> {
  const gh = await container.github();
  const detail = await gh.getPullRequest({ owner: repo.owner, name: repo.name }, pr.number);

  await container.db.delete(t.prFiles).where(eq(t.prFiles.prId, pr.id));
  if (detail.files.length > 0) {
    await container.db.insert(t.prFiles).values(
      detail.files.map((f) => ({
        prId: pr.id,
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch ?? null,
      })),
    );
  }
  await container.db.delete(t.prCommits).where(eq(t.prCommits.prId, pr.id));
  if (detail.commits.length > 0) {
    await container.db.insert(t.prCommits).values(
      detail.commits.map((c) => ({
        prId: pr.id,
        sha: c.sha,
        message: c.message,
        author: c.author,
        committedAt: c.committed_at ? new Date(c.committed_at) : null,
      })),
    );
  }
  await container.db
    .update(t.pullRequests)
    .set({
      body: detail.body ?? null,
      // Diff stats aren't on GitHub's PR-list payload — backfill them from
      // the detail fetch so the Pull Requests list shows real size/files.
      additions: detail.additions,
      deletions: detail.deletions,
      filesCount: detail.files_count,
    })
    .where(eq(t.pullRequests.id, pr.id));

  return { ...detail, id: pr.id };
}
