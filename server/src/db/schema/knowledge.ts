import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, boolean, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One conventions-extraction run over a repo (conventions-extractor spec §5).
 *
 * Declared BEFORE `conventions` so its FK target reads naturally; the reference
 * itself is a lazy arrow, so order is not load-bearing. Every scan is kept — the
 * `head_sha` is what lets a candidate's evidence link pin the exact commit its
 * lines were read from, and the newest row is the `extracted_at` / `model` the
 * API reports. Nothing prunes the history yet (see the spec's open questions).
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    /** Clone HEAD at scan time — pins every evidence link of this scan. */
    headSha: text('head_sha'),
    /** The model resolved from Settings → Models for the `conventions` feature. */
    model: text('model'),
    sampleFiles: integer('sample_files'),
    /** Candidates the code-side evidence check threw away. */
    dropped: integer('dropped'),
    warnings: jsonb('warnings').$type<string[]>(),
    createdAt: now(),
  },
  (t) => ({ repoIdx: index('convention_scans_repo_idx').on(t.repoId, t.createdAt) }),
);

/**
 * A candidate house rule with the evidence that backs it.
 *
 * `status` is the source of truth — `accepted` is a mirror column kept for the
 * pre-existing wire shape and written in lockstep. A `rejected` row is a
 * TOMBSTONE: a rescan matches new candidates on `rule_key` (the normalized
 * rule) and drops anything that hits one, so a rejected rule never comes back.
 */
export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    /** The scan that produced this row; null once that scan row is deleted. */
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'set null' }),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'error-handling',
        'typing',
        'testing',
        'imports',
        'api',
        'style',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    rule: text('rule').notNull(),
    /** `normalizeRule(rule)` — the rescan merge key, not a display value. */
    ruleKey: text('rule_key'),
    evidencePath: text('evidence_path'),
    evidenceStartLine: integer('evidence_start_line'),
    evidenceEndLine: integer('evidence_end_line'),
    evidenceSnippet: text('evidence_snippet'),
    confidence: doublePrecision('confidence'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    accepted: boolean('accepted').notNull().default(false),
    createdAt: now(),
  },
  (t) => ({ repoStatusIdx: index('conventions_repo_status_idx').on(t.repoId, t.status) }),
);
