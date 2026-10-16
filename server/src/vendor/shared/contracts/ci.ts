import { z } from 'zod';
import { CiFile, CiInstallation } from './eval-ci.js';

/**
 * Export to CI (SPEC-05) — request/response shapes of the `ci` module.
 * Reuses `CiFile` and `CiInstallation` from `eval-ci.ts`. Byte-identical in
 * the server and client copies.
 */

export const CiTrigger = z.enum(['opened', 'synchronize', 'reopened']);
export type CiTrigger = z.infer<typeof CiTrigger>;

export const CiPostAs = z.enum(['github_review', 'pr_comment', 'none']);
export type CiPostAs = z.infer<typeof CiPostAs>;

export const CiBundleInput = z.object({
  repo_id: z.string().uuid(),
  triggers: z
    .array(CiTrigger)
    .min(1)
    .refine((t) => new Set(t).size === t.length, { message: 'triggers must be unique' }),
  post_as: CiPostAs,
});
export type CiBundleInput = z.infer<typeof CiBundleInput>;

export const CiInstallInput = CiBundleInput.extend({
  workflow: z.string().min(1).optional(),
});
export type CiInstallInput = z.infer<typeof CiInstallInput>;

export const CiPreview = z.object({ files: z.array(CiFile) });
export type CiPreview = z.infer<typeof CiPreview>;

export const CiInstallResult = z.object({
  installation: CiInstallation,
  pr_url: z.string(),
  reused_pr: z.boolean(),
  paths: z.array(z.string()),
});
export type CiInstallResult = z.infer<typeof CiInstallResult>;

export const CiRunRow = z.object({
  id: z.string(),
  repo: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  agent_id: z.string().nullable(),
  agent: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  duration_s: z.number().nullable(),
  ran_at: z.string().nullable(),
  github_url: z.string().nullable(),
});
export type CiRunRow = z.infer<typeof CiRunRow>;

/** Newest first. */
export const CiRunsResponse = z.object({ runs: z.array(CiRunRow) });
export type CiRunsResponse = z.infer<typeof CiRunsResponse>;

export const CiRefreshResult = z.object({
  runs: z.array(CiRunRow),
  error: z.string().nullable(),
  ingested: z.number().int(),
  skipped: z.number().int(),
});
export type CiRefreshResult = z.infer<typeof CiRefreshResult>;
