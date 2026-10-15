import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Project-context data-access. Owns `agent_context_docs` and
 * `skill_context_docs`; reads `repos` read-only. Agents, skills and their links
 * are reached through `container.agentsRepo` / `container.skillsRepo`. The two
 * link tables carry no workspace id, so the service looks up the owner and the
 * repository workspace-scoped first.
 */

export type RepoRow = typeof t.repos.$inferSelect;
export type ContextOwner = { kind: 'agent' | 'skill'; id: string };

export class ProjectContextRepository {
  constructor(private db: Db) {}

  async repo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
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

  /** The stored paths of several agents for one repository, by agent id. */
  async pathsForAgents(agentIds: string[], repoId: string): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (agentIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(t.agentContextDocs)
      .where(and(inArray(t.agentContextDocs.agentId, agentIds), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.position));
    for (const r of rows) {
      const list = out.get(r.agentId) ?? [];
      list.push(r.path);
      out.set(r.agentId, list);
    }
    return out;
  }
}
