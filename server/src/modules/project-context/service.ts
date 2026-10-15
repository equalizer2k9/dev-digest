import { PROJECT_CONTEXT_HEADING, renderProjectDocument } from '@devdigest/reviewer-core';
import type {
  ProjectContextAttachInput,
  ProjectContextAttachments,
  ProjectContextDocument,
  ProjectContextEntry,
  ProjectContextList,
  ProjectContextPreview,
  ProjectContextSkipReason,
} from '@devdigest/shared';
import { isPathEscape } from '@devdigest/shared';
import { resolvedTargetRule } from '../_shared/symlink-rule.js';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError } from '../../platform/errors.js';
import { isFileTooLarge } from '../../adapters/file-too-large.js';
import {
  IGNORED_SEGMENTS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_CHARS,
  MAX_WALK_ENTRIES,
  SECTION_TOKEN_BUDGET,
} from './constants.js';
import { documentTag, effectiveDocuments, withinBudget, type SkillDocs } from './helpers.js';
import { ProjectContextRepository, type ContextOwner, type RepoRow } from './repository.js';

/** Result of reading one stored or requested path from the clone. */
export type ReadOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: Exclude<ProjectContextSkipReason, 'over_budget'> };

const NOT_FOUND_MESSAGE = 'Document not found';
const PATH_INVALID_MESSAGE = 'A path is not a project-context document of this repository';

/** One agent with everything needed to resolve its effective documents. */
interface AgentUsage {
  id: string;
  name: string;
  enabled: boolean;
  own: string[];
  skills: SkillDocs[];
}

type Effective = { path: string; skill: { id: string; name: string } | null };
type Resolved = { entry: ProjectContextEntry; skill: Effective['skill']; content: string | null };

const errCode = (err: unknown): unknown =>
  typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;

/**
 * Project context: lists and previews the Markdown documents of a repository's
 * clone. Every entry point looks the repository up workspace-scoped before git
 * is touched. Document text and file-system paths never reach an error message
 * or a log line.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  private async repoOrThrow(workspaceId: string, repoId: string): Promise<RepoRow> {
    const row = await this.repo.repo(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repository not found');
    return row;
  }

  /** One capped read, every outcome mapped to a reason (never throws on a read). */
  async readOutcome(repo: Pick<RepoRow, 'owner' | 'name'>, path: string): Promise<ReadOutcome> {
    if (documentTag(path) === null) return { ok: false, reason: 'outside_clone' };
    let text: string;
    try {
      text = await this.container.git.readFile(
        { owner: repo.owner, name: repo.name },
        path,
        MAX_DOCUMENT_BYTES,
        // The resolved target must itself be a document: a committed symlink must
        // not reach .git/config (clone token), .env or any non-document file.
        resolvedTargetRule((realRel) => documentTag(realRel) !== null),
      );
    } catch (err) {
      if (isPathEscape(err)) return { ok: false, reason: 'outside_clone' };
      const code = errCode(err);
      if (code === 'ENOENT' || code === 'ENOTDIR') return { ok: false, reason: 'missing' };
      if (isFileTooLarge(err)) return { ok: false, reason: 'too_large' };
      return { ok: false, reason: 'unreadable' };
    }
    if (text.length > MAX_DOCUMENT_CHARS) return { ok: false, reason: 'too_large' };
    return { ok: true, text };
  }

  async list(workspaceId: string, repoId: string): Promise<ProjectContextList> {
    const repo = await this.repoOrThrow(workspaceId, repoId);
    const empty: ProjectContextList = { has_clone: false, documents: [], truncated: false };
    if (!repo.clonePath) return empty;

    let listing: { paths: string[]; truncated: boolean };
    try {
      listing = await this.container.git.listFiles(
        { owner: repo.owner, name: repo.name },
        {
          accept: (p) => documentTag(p) !== null,
          skipDirs: IGNORED_SEGMENTS,
          limit: MAX_DOCUMENTS,
          maxEntries: MAX_WALK_ENTRIES,
        },
      );
    } catch (err) {
      if (errCode(err) === 'ENOENT') return empty;
      throw err;
    }

    // used_by: agents (enabled or not) whose effective documents hold the path.
    const usedBy = new Map<string, number>();
    for (const agent of await this.usage(workspaceId, repo.id)) {
      for (const d of effectiveDocuments(agent.own, agent.skills)) {
        usedBy.set(d.path, (usedBy.get(d.path) ?? 0) + 1);
      }
    }

    const documents: ProjectContextDocument[] = [];
    for (const path of listing.paths) {
      const out = await this.readOutcome(repo, path);
      documents.push({
        path,
        tag: documentTag(path)!,
        tokens: out.ok ? this.container.tokenizer.count(out.text) : null,
        too_large: !out.ok && out.reason === 'too_large',
        used_by: usedBy.get(path) ?? 0,
      });
    }
    return { has_clone: true, documents, truncated: listing.truncated };
  }

  async preview(workspaceId: string, repoId: string, path: string): Promise<ProjectContextPreview> {
    const repo = await this.repoOrThrow(workspaceId, repoId);
    if (documentTag(path) === null) throw new NotFoundError(NOT_FOUND_MESSAGE);
    const out = await this.readOutcome(repo, path);
    if (out.ok) return { path, content: out.text };
    if (out.reason === 'missing' || out.reason === 'outside_clone') {
      throw new NotFoundError(NOT_FOUND_MESSAGE);
    }
    if (out.reason === 'too_large') {
      throw new AppError('context_document_too_large', 'Document is too large to preview', 413);
    }
    throw new AppError('context_document_unreadable', 'Document could not be read', 422);
  }

  /**
   * Every agent of the workspace (name, then id) with its attachments for the
   * repository and its linked skills (agent_skills order) with theirs. Agents and
   * links come from `container.agentsRepo`; only the attachments are our own.
   */
  private async usage(workspaceId: string, repoId: string): Promise<AgentUsage[]> {
    const agents = await this.container.agentsRepo.list(workspaceId);
    if (agents.length === 0) return [];
    const links = new Map(
      await Promise.all(
        agents.map(async (a) => [a.id, await this.container.agentsRepo.linkedSkills(a.id)] as const),
      ),
    );
    const skillIds = [...new Set([...links.values()].flatMap((l) => l.map((x) => x.skill.id)))];
    const [ownBy, skillPaths] = await Promise.all([
      this.repo.pathsForAgents(agents.map((a) => a.id), repoId),
      this.repo.pathsForSkills(skillIds, repoId),
    ]);
    return agents
      .map((a) => ({
        id: a.id,
        name: a.name,
        enabled: a.enabled,
        own: ownBy.get(a.id) ?? [],
        skills: (links.get(a.id) ?? []).map((l) => ({
          id: l.skill.id,
          name: l.skill.name,
          enabled: l.skill.enabled,
          paths: skillPaths.get(l.skill.id) ?? [],
        })),
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  // ---------------------------------------------------------------- attachments

  private async ownerOrThrow(workspaceId: string, owner: ContextOwner): Promise<void> {
    const found =
      owner.kind === 'agent'
        ? await this.container.agentsRepo.getById(workspaceId, owner.id)
        : await this.container.skillsRepo.getById(workspaceId, owner.id);
    if (!found) throw new NotFoundError(owner.kind === 'agent' ? 'Agent not found' : 'Skill not found');
  }

  /** Effective documents of an agent (own + enabled linked skills) or of a skill. */
  private async effectiveFor(owner: ContextOwner, repoId: string): Promise<Effective[]> {
    const own = await this.repo.paths(owner, repoId);
    if (owner.kind === 'skill') return own.map((path) => ({ path, skill: null }));
    const links = await this.container.agentsRepo.linkedSkills(owner.id);
    const enabled = links.filter((l) => l.skill.enabled);
    const byId = await this.repo.pathsForSkills(
      enabled.map((l) => l.skill.id),
      repoId,
    );
    const skills: SkillDocs[] = enabled.map((l) => ({
      id: l.skill.id,
      name: l.skill.name,
      enabled: true,
      paths: byId.get(l.skill.id) ?? [],
    }));
    return effectiveDocuments(own, skills);
  }

  /**
   * Read and budget `docs` in order. The section budget counts the heading plus
   * each document's block exactly as the prompt renders it (D-8). Once a
   * document goes over, every later readable one is `over_budget`; with
   * `readAfterOver` false it is not even read (a run), otherwise it is read so
   * its tokens can be shown (the editor).
   */
  private async resolve(
    repo: Pick<RepoRow, 'owner' | 'name'>,
    docs: Effective[],
    readAfterOver: boolean,
  ): Promise<Resolved[]> {
    const count = (text: string) => this.container.tokenizer.count(text);
    let used = count(PROJECT_CONTEXT_HEADING);
    let over = false;
    let includedBlocks = 0;
    const out: Resolved[] = [];
    for (const { path, skill } of docs) {
      if (over && !readAfterOver) {
        out.push({ entry: { path, tokens: null, skip_reason: 'over_budget' }, skill, content: null });
        continue;
      }
      const read = await this.readOutcome(repo, path);
      if (!read.ok) {
        out.push({ entry: { path, tokens: null, skip_reason: read.reason }, skill, content: null });
        continue;
      }
      const blank = read.text.trim().length === 0;
      const tokens = blank ? 0 : count(read.text);
      if (over) {
        out.push({ entry: { path, tokens, skip_reason: 'over_budget' }, skill, content: null });
        continue;
      }
      if (!blank) {
        const block = renderProjectDocument({ path, content: read.text });
        const cost = count(includedBlocks > 0 ? `\n\n${block}` : block);
        if (!withinBudget(used, cost, SECTION_TOKEN_BUDGET)) {
          over = true;
          // A run records the first over-budget document as unread: no tokens.
          out.push({
            entry: { path, tokens: readAfterOver ? tokens : null, skip_reason: 'over_budget' },
            skill,
            content: null,
          });
          continue;
        }
        used += cost;
        includedBlocks++;
      }
      out.push({ entry: { path, tokens, skip_reason: null }, skill, content: blank ? null : read.text });
    }
    return out;
  }

  async getAttachments(
    workspaceId: string,
    owner: ContextOwner,
    repoId: string,
  ): Promise<ProjectContextAttachments> {
    await this.ownerOrThrow(workspaceId, owner);
    const repo = await this.repoOrThrow(workspaceId, repoId);
    const attached = await this.repo.paths(owner, repo.id);
    const resolved = await this.resolve(repo, await this.effectiveFor(owner, repo.id), true);
    return {
      repo_id: repo.id,
      attached,
      effective: resolved.map((r) => ({ ...r.entry, skill: r.skill })),
    };
  }

  async setAttachments(
    workspaceId: string,
    owner: ContextOwner,
    input: ProjectContextAttachInput,
  ): Promise<ProjectContextAttachments> {
    await this.ownerOrThrow(workspaceId, owner);
    const repo = await this.repoOrThrow(workspaceId, input.repo_id);
    const invalid = () => new AppError('context_path_invalid', PATH_INVALID_MESSAGE, 422);
    if (input.paths.some((p) => documentTag(p) === null)) throw invalid();
    // D-5: only paths new to this owner must exist; stored ones are kept as they are.
    const stored = new Set(await this.repo.paths(owner, repo.id));
    for (const path of input.paths) {
      if (stored.has(path)) continue;
      const out = await this.readOutcome(repo, path);
      if (!out.ok && out.reason !== 'too_large') throw invalid();
    }
    await this.repo.setPaths(owner, repo.id, input.paths);
    return this.getAttachments(workspaceId, owner, repo.id);
  }

  // ---------------------------------------------------------------- consumers

  /** Documents of one agent for a review run; never throws on a document. */
  async forRun(
    agentId: string,
    repo: RepoRow,
  ): Promise<{ documents: { path: string; content: string }[]; entries: ProjectContextEntry[] }> {
    const effective = await this.effectiveFor({ kind: 'agent', id: agentId }, repo.id);
    const resolved = await this.resolve(repo, effective, false);
    return {
      entries: resolved.map((r) => r.entry),
      documents: resolved.flatMap((r) => (r.content === null ? [] : [{ path: r.entry.path, content: r.content }])),
    };
  }

  /** Documents of every enabled agent (name order) for the PR Brief. */
  async forBrief(
    workspaceId: string,
    repoId: string,
    maxChars: number,
  ): Promise<{
    documents: { path: string; content: string }[];
    skipped: { path: string; reason: Exclude<ProjectContextSkipReason, 'over_budget'> }[];
  }> {
    const repo = await this.repoOrThrow(workspaceId, repoId);
    const documents: { path: string; content: string }[] = [];
    const skipped: { path: string; reason: Exclude<ProjectContextSkipReason, 'over_budget'> }[] = [];
    const seen = new Set<string>();
    let chars = 0;
    for (const agent of await this.usage(workspaceId, repo.id)) {
      if (!agent.enabled) continue;
      for (const { path } of effectiveDocuments(agent.own, agent.skills)) {
        if (seen.has(path)) continue;
        seen.add(path);
        // Later documents are dropped last-first by the brief, so none could fit.
        if (chars > maxChars) return { documents, skipped };
        const out = await this.readOutcome(repo, path);
        if (!out.ok) {
          skipped.push({ path, reason: out.reason });
          continue;
        }
        chars += out.text.length;
        if (out.text.trim().length > 0) documents.push({ path, content: out.text });
      }
    }
    return { documents, skipped };
  }
}
