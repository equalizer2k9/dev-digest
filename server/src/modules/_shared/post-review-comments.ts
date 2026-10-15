import type {
  CreateReviewCommentInput,
  GitHubClient,
  PrReviewComment,
  RepoRef,
} from '@devdigest/shared';

/** Post inline review comments to a PR, in the given order. */
export async function postReviewComments(
  gh: GitHubClient,
  repo: RepoRef,
  prNumber: number,
  comments: CreateReviewCommentInput[],
): Promise<PrReviewComment[]> {
  const posted: PrReviewComment[] = [];
  for (const comment of comments) {
    posted.push(await gh.createReviewComment(repo, prNumber, comment));
  }
  return posted;
}
