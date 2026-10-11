import { eq } from 'drizzle-orm';
import type { PrDetail } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Pulls data-access: persists a PR detail fetched from GitHub. Owns the writes
 * to `pr_files` + `pr_commits` and the body / diff-stat backfill on
 * `pull_requests`.
 */
export class PullsRepository {
  constructor(private db: Db) {}

  /**
   * Replace a PR's files and commits and backfill body + diff stats — ONE
   * transaction, so a failure never leaves a PR with its files wiped.
   */
  replaceDetail(prId: string, detail: PrDetail): Promise<void> {
    return this.db.transaction(async (tx) => {
      await tx.delete(t.prFiles).where(eq(t.prFiles.prId, prId));
      if (detail.files.length > 0) {
        await tx.insert(t.prFiles).values(
          detail.files.map((f) => ({
            prId,
            path: f.path,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch ?? null,
          })),
        );
      }
      await tx.delete(t.prCommits).where(eq(t.prCommits.prId, prId));
      if (detail.commits.length > 0) {
        await tx.insert(t.prCommits).values(
          detail.commits.map((c) => ({
            prId,
            sha: c.sha,
            message: c.message,
            author: c.author,
            committedAt: c.committed_at ? new Date(c.committed_at) : null,
          })),
        );
      }
      await tx
        .update(t.pullRequests)
        .set({
          body: detail.body ?? null,
          // Diff stats aren't on GitHub's PR-list payload — backfill them from
          // the detail fetch so the Pull Requests list shows real size/files.
          additions: detail.additions,
          deletions: detail.deletions,
          filesCount: detail.files_count,
        })
        .where(eq(t.pullRequests.id, prId));
    });
  }
}
