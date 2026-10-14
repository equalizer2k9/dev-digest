import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillDocs } from './helpers.js';

/**
 * Project-context data-access. Owns `agent_context_docs` and
 * `skill_context_docs`; reads `repos`, `skills`, `agents` and `agent_skills`
 * (owned elsewhere) read-only. The two link tables carry no workspace id, so the
 * service looks up the owner and the repository workspace-scoped first.
 */

export type RepoRow = typeof t.repos.$inferSelect;
export type ContextOwner = { kind: 'agent' | 'skill'; id: string };

/** One agent with everything needed to resolve its effective documents. */
export interface AgentUsage {
  id: string;
  name: string;
  enabled: boolean;
  own: string[];
  skills: SkillDocs[];
}

export class ProjectContextRepository {
  constructor(private db: Db) {}

  async repo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async skill(workspaceId: string, skillId: string): Promise<{ id: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ id: t.skills.id, name: t.skills.name })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, skillId)));
    return row;
  }

  /** The stored paths of one owner for one repository, in position order. */
  async paths(owner: ContextOwner, repoId: string): Promise<string[]> {
    if (owner.kind === 'agent') {
      const rows = await this.db
        .select({ path: t.agentContextDocs.path })
        .from(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, owner.id), eq(t.agentContextDocs.repoId, repoId)))
        .orderBy(asc(t.agentContextDocs.position));
      return rows.map((r) => r.path);
    }
    const rows = await this.db
      .select({ path: t.skillContextDocs.path })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, owner.id), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    return rows.map((r) => r.path);
  }

  /** The stored paths of several skills for one repository, by skill id. */
  async pathsForSkills(skillIds: string[], repoId: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (skillIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(t.skillContextDocs)
      .where(and(inArray(t.skillContextDocs.skillId, skillIds), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.position));
    for (const r of rows) {
      const list = out.get(r.skillId) ?? [];
      list.push(r.path);
      out.set(r.skillId, list);
    }
    return out;
  }

  /** Replace the whole ordered list of one owner for one repository, atomically. */
  async setPaths(owner: ContextOwner, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      if (owner.kind === 'agent') {
        await tx
          .delete(t.agentContextDocs)
          .where(and(eq(t.agentContextDocs.agentId, owner.id), eq(t.agentContextDocs.repoId, repoId)));
        if (paths.length === 0) return;
        await tx
          .insert(t.agentContextDocs)
          .values(paths.map((path, position) => ({ agentId: owner.id, repoId, position, path })));
        return;
      }
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, owner.id), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, position) => ({ skillId: owner.id, repoId, position, path })));
    });
  }

  /**
   * Every agent of the workspace (name, then id) with its attachments for the
   * repository and its linked skills (agent_skills order) with theirs. Read-only.
   */
  async usage(workspaceId: string, repoId: string): Promise<AgentUsage[]> {
    const agents = await this.db
      .select({ id: t.agents.id, name: t.agents.name, enabled: t.agents.enabled })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    if (agents.length === 0) return [];
    const agentIds = agents.map((a) => a.id);

    const own = await this.db
      .select()
      .from(t.agentContextDocs)
      .where(and(inArray(t.agentContextDocs.agentId, agentIds), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    const links = await this.db
      .select({
        agentId: t.agentSkills.agentId,
        order: t.agentSkills.order,
        skillId: t.skills.id,
        name: t.skills.name,
        enabled: t.skills.enabled,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(inArray(t.agentSkills.agentId, agentIds))
      .orderBy(asc(t.agentSkills.order));
    const skillPaths = await this.pathsForSkills([...new Set(links.map((l) => l.skillId))], repoId);

    const ownBy = new Map<string, string[]>();
    for (const r of own) ownBy.set(r.agentId, [...(ownBy.get(r.agentId) ?? []), r.path]);
    const skillsBy = new Map<string, SkillDocs[]>();
    for (const l of links) {
      skillsBy.set(l.agentId, [
        ...(skillsBy.get(l.agentId) ?? []),
        { id: l.skillId, name: l.name, enabled: l.enabled, paths: skillPaths.get(l.skillId) ?? [] },
      ]);
    }
    return agents
      .map((a) => ({ ...a, own: ownBy.get(a.id) ?? [], skills: skillsBy.get(a.id) ?? [] }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
}
