import { and, eq } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';
import * as t from '../../../db/schema.js';
import type { Intent, IntentConfidence, IntentSource } from '@devdigest/shared';
import type { PullRow } from '../../../db/rows.js';

// ---- PR lookup (workspace-scoped) -----------------------------------------

export async function getPull(
  db: Db,
  workspaceId: string,
  prId: string,
): Promise<PullRow | undefined> {
  const [row] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
  return row;
}

export async function getRepo(
  db: Db,
  repoId: string,
): Promise<typeof t.repos.$inferSelect | undefined> {
  const [row] = await db.select().from(t.repos).where(eq(t.repos.id, repoId));
  return row;
}

export async function getPrFiles(
  db: Db,
  prId: string,
): Promise<(typeof t.prFiles.$inferSelect)[]> {
  return db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
}

/**
 * Record the commit a review just ran against, so the PR list can derive
 * `reviewed` vs `needs_review` (head moved since the last review) vs `stale`.
 */
export async function markReviewed(db: Db, prId: string, sha: string): Promise<void> {
  await db
    .update(t.pullRequests)
    .set({ lastReviewedSha: sha })
    .where(eq(t.pullRequests.id, prId));
}

// ---- intent ---------------------------------------------------------------

export async function upsertIntent(db: Db, prId: string, intent: Intent): Promise<void> {
  await db
    .insert(t.prIntent)
    .values({
      prId,
      intent: intent.intent,
      inScope: intent.in_scope,
      outOfScope: intent.out_of_scope,
    })
    .onConflictDoUpdate({
      target: t.prIntent.prId,
      set: { intent: intent.intent, inScope: intent.in_scope, outOfScope: intent.out_of_scope },
    });
}

export async function getIntent(db: Db, prId: string): Promise<Intent | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope };
}

/** A stored intent with its provenance — what `pr_intent` holds beyond `Intent`. */
export interface IntentRecord {
  intent: Intent;
  confidence: IntentConfidence;
  sources: IntentSource[];
  provider: string | null;
  model: string | null;
  headSha: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  generatedAt: Date | null;
}

/** Row written before the intent layer (no confidence) reads back as `low`. */
function toConfidence(v: string | null): IntentConfidence {
  return v === 'high' || v === 'medium' || v === 'low' ? v : 'low';
}

export async function getIntentRecord(db: Db, prId: string): Promise<IntentRecord | undefined> {
  const [row] = await db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
  if (!row) return undefined;
  return {
    intent: { intent: row.intent, in_scope: row.inScope, out_of_scope: row.outOfScope },
    confidence: toConfidence(row.confidence),
    sources: row.sources,
    provider: row.provider,
    model: row.model,
    headSha: row.headSha,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    generatedAt: row.generatedAt,
  };
}

export async function saveIntentRecord(db: Db, prId: string, rec: IntentRecord): Promise<void> {
  const values = {
    intent: rec.intent.intent,
    inScope: rec.intent.in_scope,
    outOfScope: rec.intent.out_of_scope,
    confidence: rec.confidence,
    sources: rec.sources,
    provider: rec.provider,
    model: rec.model,
    headSha: rec.headSha,
    tokensIn: rec.tokensIn,
    tokensOut: rec.tokensOut,
    costUsd: rec.costUsd,
    generatedAt: rec.generatedAt,
  };
  await db
    .insert(t.prIntent)
    .values({ prId, ...values })
    .onConflictDoUpdate({ target: t.prIntent.prId, set: values });
}
