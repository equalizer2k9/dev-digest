import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillSource, SkillType } from '@devdigest/shared';
import { INITIAL_SKILL_VERSION } from './constants.js';

/**
 * Skills data-access. The ONLY place in this module touching Drizzle tables:
 * `skills` + `skill_versions` (it owns both) and a read-only grouped count over
 * `agent_skills` (owned by the agents module). Every query is workspace-scoped,
 * so a skill from another workspace is simply not found — never a 403.
 */

export type SkillRow = typeof t.skills.$inferSelect;
export type SkillVersionRow = typeof t.skillVersions.$inferSelect;

/** A skill row plus how many agents link it (Skills grid). */
export interface SkillUsageRow {
  skill: SkillRow;
  agentCount: number;
}

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: SkillType;
  source: SkillSource;
  body: string;
  enabled?: boolean;
}

/** Everything a PUT can change EXCEPT the body — the body is versioned. */
export interface UpdateSkillMeta {
  name?: string;
  description?: string;
  type?: SkillType;
  enabled?: boolean;
}

export class SkillsRepository {
  constructor(private db: Db) {}

  /**
   * Every skill in the workspace, name ascending, each with `agent_count`.
   *
   * ONE statement: the counts are a `GROUP BY skill_id` sub-select LEFT JOINed
   * onto `skills` — not a count per row (spec §4). Skills linked by no agent
   * keep a 0 count because the join is a LEFT one.
   */
  async listWithUsage(workspaceId: string): Promise<SkillUsageRow[]> {
    const counts = this.db
      .select({
        skillId: t.agentSkills.skillId,
        agentCount: sql<number>`count(*)`.as('agent_count'),
      })
      .from(t.agentSkills)
      .groupBy(t.agentSkills.skillId)
      .as('agent_counts');

    const rows = await this.db
      .select({
        skill: t.skills,
        agentCount: sql<number>`coalesce(${counts.agentCount}, 0)`.mapWith(Number),
      })
      .from(t.skills)
      .leftJoin(counts, eq(counts.skillId, t.skills.id))
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));

    return rows.map((r) => ({ skill: r.skill, agentCount: r.agentCount }));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Insert a skill at version 1 AND its v1 `skill_versions` snapshot in ONE
   * transaction — a skill never exists without the version that made it.
   */
  async insertWithVersion(values: InsertSkill): Promise<SkillRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(t.skills)
        .values({
          workspaceId: values.workspaceId,
          name: values.name,
          description: values.description,
          type: values.type,
          source: values.source,
          body: values.body,
          enabled: values.enabled ?? true,
          version: INITIAL_SKILL_VERSION,
        })
        .returning();
      await tx.insert(t.skillVersions).values({
        skillId: row!.id,
        version: INITIAL_SKILL_VERSION,
        body: row!.body,
      });
      return row!;
    });
  }

  /**
   * Metadata-only update: NO version bump, NO new `skill_versions` row. This is
   * the path a plain `enabled` toggle or a rename takes.
   */
  async updateMetadata(
    workspaceId: string,
    id: string,
    patch: UpdateSkillMeta,
  ): Promise<SkillRow | undefined> {
    if (Object.keys(patch).length === 0) return this.getById(workspaceId, id);
    const [row] = await this.db
      .update(t.skills)
      .set(patch)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();
    return row;
  }

  /**
   * Write a new body at `nextVersion` and append the matching `skill_versions`
   * row, in ONE transaction. Append-only: no historical row is ever updated or
   * deleted, which is what makes a restore itself undoable.
   */
  async updateWithNewVersion(
    workspaceId: string,
    id: string,
    patch: UpdateSkillMeta,
    nextVersion: number,
    body: string,
  ): Promise<SkillRow | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(t.skills)
        .set({ ...patch, body, version: nextVersion })
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning();
      if (!row) return undefined;
      await tx
        .insert(t.skillVersions)
        .values({ skillId: id, version: nextVersion, body })
        .onConflictDoNothing();
      return row;
    });
  }

  /** Delete a skill; `skill_versions` + `agent_skills` cascade (FKs, 0000_init). */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  // ---- skill_versions (immutable body snapshots) --------------------------

  /** Every snapshot for a skill, newest version first. */
  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  /** One snapshot, or undefined when that version was never recorded. */
  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }
}
