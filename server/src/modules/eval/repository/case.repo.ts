import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';

export type EvalCaseDbRow = typeof t.evalCases.$inferSelect;
export type NewEvalCase = typeof t.evalCases.$inferInsert;

export type CreateCaseResult =
  | { kind: 'created'; row: EvalCaseDbRow }
  | { kind: 'existing'; row: EvalCaseDbRow }
  | { kind: 'conflict'; row: EvalCaseDbRow };

export async function caseBySourceFinding(
  db: Db,
  workspaceId: string,
  findingId: string,
): Promise<EvalCaseDbRow | undefined> {
  const [row] = await db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.sourceFindingId, findingId)));
  return row;
}

/** An agent's cases, newest first. */
export function listCases(db: Db, workspaceId: string, agentId: string): Promise<EvalCaseDbRow[]> {
  return db
    .select()
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.agentId, agentId)))
    .orderBy(desc(t.evalCases.createdAt), desc(t.evalCases.id));
}

/**
 * One transaction per agent: the agent row is locked `FOR UPDATE`, so the conflict
 * check (`decide`) and the insert are serialised against other creations for the
 * same agent. `decide` returns the opposite-type case that blocks the new one, or null.
 * A concurrent insert for the same finding resolves to `existing` (unique source_finding_id).
 */
export function createCaseExclusive(
  db: Db,
  values: NewEvalCase & { agentId: string; sourceFindingId: string },
  decide: (agentCases: EvalCaseDbRow[]) => EvalCaseDbRow | null,
): Promise<CreateCaseResult> {
  return db.transaction(async (tx) => {
    await tx.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.id, values.agentId)).for('update');

    const agentCases = await tx
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, values.workspaceId), eq(t.evalCases.agentId, values.agentId)));

    // A case for this finding that landed since the caller's check wins over a conflict.
    const same = agentCases.find((c) => c.sourceFindingId === values.sourceFindingId);
    if (same) return { kind: 'existing', row: same };

    const blocker = decide(agentCases);
    if (blocker) return { kind: 'conflict', row: blocker };

    const [inserted] = await tx
      .insert(t.evalCases)
      .values(values)
      .onConflictDoNothing({ target: t.evalCases.sourceFindingId })
      .returning();
    if (inserted) return { kind: 'created', row: inserted };

    const [existing] = await tx
      .select()
      .from(t.evalCases)
      .where(eq(t.evalCases.sourceFindingId, values.sourceFindingId));
    return { kind: 'existing', row: existing! };
  });
}

export async function deleteCase(
  db: Db,
  workspaceId: string,
  agentId: string,
  caseId: string,
): Promise<boolean> {
  const rows = await db
    .delete(t.evalCases)
    .where(
      and(
        eq(t.evalCases.workspaceId, workspaceId),
        eq(t.evalCases.agentId, agentId),
        eq(t.evalCases.id, caseId),
      ),
    )
    .returning({ id: t.evalCases.id });
  return rows.length > 0;
}
