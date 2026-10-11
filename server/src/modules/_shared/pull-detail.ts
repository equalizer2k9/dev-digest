import type { PrDetail } from '@devdigest/shared';
import type { PullRow } from '../../db/rows.js';
import type { Container } from '../../platform/container.js';

/**
 * Refresh a PR's detail from GitHub and persist it (via `container.pullsRepo`):
 * replaces `pr_files` and `pr_commits`, backfills body + diff stats on
 * `pull_requests`. Shared by `GET /pulls/:id` and `GET /pulls/:id/blast` so
 * there is exactly one copy.
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
  await container.pullsRepo.replaceDetail(pr.id, detail);
  return { ...detail, id: pr.id };
}
