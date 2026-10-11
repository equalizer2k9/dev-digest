import { apiGet, seg } from './api-client.js';
import { unknownAgent, unknownPr, unknownRepo } from './errors.js';
import { AgentList, PullList, RepoList, type AgentRow, type PullRow, type RepoRow } from './schemas.js';

/** `owner/name` (case-insensitive) → repo. Omitted → the only imported repo. */
export async function resolveRepo(repo?: string): Promise<RepoRow> {
  const repos = await apiGet('/repos', RepoList);
  const known = repos.map((r) => r.full_name);
  if (repo === undefined || repo.trim() === '') {
    const only = repos.length === 1 ? repos[0] : undefined;
    if (only) return only;
    throw unknownRepo(repo, known);
  }
  const wanted = repo.trim().toLowerCase();
  const hit = repos.find((r) => r.full_name.toLowerCase() === wanted);
  if (!hit) throw unknownRepo(repo, known);
  return hit;
}

/** PR number → the API's row uuid. */
export async function resolvePull(
  prNumber: number,
  repo?: string,
): Promise<{ repo: RepoRow; pull: PullRow }> {
  const r = await resolveRepo(repo);
  const pulls = await apiGet(`/repos/${seg(r.id)}/pulls`, PullList);
  const pull = pulls.find((p) => p.number === prNumber);
  if (!pull) throw unknownPr(prNumber, r.full_name);
  return { repo: r, pull };
}

/** Agent name (case-insensitive) or id → agent row from GET /agents. */
export async function resolveAgent(nameOrId: string): Promise<AgentRow> {
  const agents = await apiGet('/agents', AgentList);
  const wanted = nameOrId.trim().toLowerCase();
  const hit =
    agents.find((a) => a.id === nameOrId.trim()) ??
    agents.find((a) => a.name.toLowerCase() === wanted);
  if (!hit) throw unknownAgent(nameOrId, agents.map((a) => a.name));
  return hit;
}
