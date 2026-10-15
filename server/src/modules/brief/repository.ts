import { and, eq } from 'drizzle-orm';
import type { PrBrief } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Brief data-access: the ONLY place in this module touching Drizzle. Owns the
 * `pr_brief` row (one per PR; `pr_id` is the primary key). Reads join
 * `pull_requests` so a PR of another workspace has no row to find.
 */
export class BriefRepository {
  constructor(private db: Db) {}

  /** The stored JSON as-is (the service validates it), or undefined when none. */
  async get(workspaceId: string, prId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prBrief.prId))
      .where(and(eq(t.prBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row?.json;
  }

  /** Last write wins (two generations at once, EC-8). */
  async upsert(prId: string, brief: PrBrief): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json: brief })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: brief } });
  }
}
