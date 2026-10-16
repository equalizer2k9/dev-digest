import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord, ReviewRunResponse } from './review-api.js';

/**
 * Multi-agent review contracts (SPEC-04). The client imports these as TYPES
 * only (`import type`); the schemas validate on the server.
 *
 * Names are deliberately distinct from the legacy `MultiAgentRun` / `AgentColumn`
 * / `Conflict` in observability.ts, which stay unused and untouched.
 * Keep this file byte-identical in both `vendor/shared` copies.
 */

/** Launch body: 2 to 5 distinct enabled agent ids. */
export const MultiRunRequest = z
  .object({
    agentIds: z.array(z.string().uuid()).min(2).max(5),
  })
  .refine((v) => new Set(v.agentIds).size === v.agentIds.length, {
    message: 'agentIds must be distinct',
    path: ['agentIds'],
  });
export type MultiRunRequest = z.infer<typeof MultiRunRequest>;

/** Same as the single-run response plus the id of the multi run. */
export const MultiRunLaunchResponse = ReviewRunResponse.extend({ multi_run_id: z.string() });
export type MultiRunLaunchResponse = z.infer<typeof MultiRunLaunchResponse>;

export const MultiRunListQuery = z.object({ pr_id: z.string().uuid().optional() });
export type MultiRunListQuery = z.infer<typeof MultiRunListQuery>;

export const MultiRunStatus = z.enum(['running', 'done', 'failed']);
export type MultiRunStatus = z.infer<typeof MultiRunStatus>;

/** One cell of the disagreement matrix. */
export const CellValue = z.union([Severity, z.enum(['did_not_flag', 'failed', 'pending'])]);
export type CellValue = z.infer<typeof CellValue>;

export const GroupCell = z.object({ run_id: z.string(), value: CellValue });
export type GroupCell = z.infer<typeof GroupCell>;

export const GroupMember = FindingRecord.extend({ run_id: z.string() });
export type GroupMember = z.infer<typeof GroupMember>;

export const FindingGroup = z.object({
  id: z.string(),
  representative: GroupMember,
  members: z.array(GroupMember),
  cells: z.array(GroupCell),
  conflict: z.boolean(),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

export const MultiRunAgent = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  /** null = the agent was deleted. */
  agent_name: z.string().nullable(),
  status: z.string().nullable(),
  error: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings_count: z.number().int().nullable(),
  score: z.number().int().nullable(),
});
export type MultiRunAgent = z.infer<typeof MultiRunAgent>;

export const MultiRunPr = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  repo_id: z.string(),
});
export type MultiRunPr = z.infer<typeof MultiRunPr>;

export const MultiRunDetail = z.object({
  id: z.string(),
  pr: MultiRunPr,
  status: MultiRunStatus,
  started_at: z.string(),
  /** null while any run is in progress. */
  wall_clock_ms: z.number().int().nullable(),
  tokens_in: z.number().int(),
  tokens_out: z.number().int(),
  /** null when no run has a known cost. */
  cost_usd: z.number().nullable(),
  agents: z.array(MultiRunAgent),
  groups: z.array(FindingGroup),
});
export type MultiRunDetail = z.infer<typeof MultiRunDetail>;

export const MultiRunListItem = z.object({
  id: z.string(),
  pr: MultiRunPr,
  agents: z.array(z.object({ agent_id: z.string().nullable(), agent_name: z.string().nullable() })),
  status: MultiRunStatus,
  wall_clock_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  started_at: z.string(),
});
export type MultiRunListItem = z.infer<typeof MultiRunListItem>;

export const MultiRunList = z.array(MultiRunListItem);
export type MultiRunList = z.infer<typeof MultiRunList>;

export const AgentEstimate = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  duration_ms: z.number().nullable(),
  cost_usd: z.number().nullable(),
  runs: z.number().int(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

export const AgentEstimates = z.object({ agents: z.array(AgentEstimate) });
export type AgentEstimates = z.infer<typeof AgentEstimates>;
