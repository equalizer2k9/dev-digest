import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { EvalCaseResult, EvalRunSkill } from '@devdigest/shared';
import { now } from './_shared';
import { workspaces } from './core';
import { agents } from './agents';
import { pullRequests } from './pulls';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
    // The agent whose eval set the case belongs to; cases go with the agent.
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    // The finding the case was made from. No FK: the case outlives a deleted review.
    sourceFindingId: uuid('source_finding_id'),
    createdAt: now(),
  },
  (t) => ({
    sourceFindingUq: uniqueIndex('eval_cases_source_finding_uq').on(t.sourceFindingId),
    agentIdx: index('eval_cases_agent_idx').on(t.agentId),
  }),
);

// One row per run of an agent's whole eval set. `caseId` is the legacy per-case link
// and stays unused. `ranAt` = start; null metrics = n/a, null cost = unknown.
export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id').references(() => evalCases.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
    workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
    agentVersion: integer('agent_version'),
    provider: text('provider'),
    model: text('model'),
    skills: jsonb('skills').$type<EvalRunSkill[]>(),
    status: text('status', { enum: ['running', 'completed', 'failed'] })
      .notNull()
      .default('running'),
    hasErrors: boolean('has_errors').notNull().default(false),
    error: text('error'),
    passed: integer('passed'),
    total: integer('total'),
    results: jsonb('results').$type<EvalCaseResult[]>(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => ({
    // At most one running run per agent.
    agentRunningUq: uniqueIndex('eval_runs_agent_running_uq')
      .on(t.agentId)
      .where(sql`status = 'running'`),
    agentRanIdx: index('eval_runs_agent_ran_idx').on(t.agentId, t.ranAt),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
