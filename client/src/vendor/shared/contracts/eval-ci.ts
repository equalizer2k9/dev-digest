import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import { EvalRun, EvalOwnerKind, EvalCase, EvalMetric, EvalExpectation, EvalExpectationType, Conformance } from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
export const EvalCaseInput = z.object({
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expected_output: z.unknown(),
  notes: z.string().nullish(),
});
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

export const EvalCaseStatus = z.enum(['passed', 'failed', 'error']);
export type EvalCaseStatus = z.infer<typeof EvalCaseStatus>;

export const EvalRunStatus = z.enum(['running', 'completed', 'failed']);
export type EvalRunStatus = z.infer<typeof EvalRunStatus>;

/** A skill as it was linked to the agent when the run started. */
export const EvalRunSkill = z.object({ name: z.string(), version: z.number().int() });
export type EvalRunSkill = z.infer<typeof EvalRunSkill>;

export const EvalKeptFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
});
export type EvalKeptFinding = z.infer<typeof EvalKeptFinding>;

/** The outcome of one case within a run (stored in `eval_runs.results`). */
export const EvalCaseResult = z.object({
  case_id: z.string(),
  name: z.string(),
  type: EvalExpectationType,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  status: EvalCaseStatus,
  kept: z.number().int(),
  dropped: z.number().int(),
  kept_findings: z.array(EvalKeptFinding),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
});
export type EvalCaseResult = z.infer<typeof EvalCaseResult>;

/** One run of an agent's whole eval set (one `eval_runs` row), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
  provider: z.string(),
  model: z.string(),
  skills: z.array(EvalRunSkill),
  status: EvalRunStatus,
  has_errors: z.boolean(),
  error: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  recall: EvalMetric,
  precision: EvalMetric,
  citation_accuracy: EvalMetric,
  passed: z.number().int(),
  total: z.number().int(),
  cost_usd: z.number().nullable(),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/** A case of an agent's eval set, with its status in the latest completed run. */
export const EvalCaseRow = EvalCase.pick({ id: true, name: true }).extend({
  agent_id: z.string(),
  expectation: EvalExpectation,
  source_finding_id: z.string().nullable(),
  created_at: z.string(),
  latest_status: z.union([EvalCaseStatus, z.literal('never_run')]),
});
export type EvalCaseRow = z.infer<typeof EvalCaseRow>;

/** Answer of "turn a finding into an eval case". */
export const EvalCaseCreated = z.object({
  case: EvalCaseRow,
  agent_id: z.string(),
  agent_name: z.string(),
  created: z.boolean(),
});
export type EvalCaseCreated = z.infer<typeof EvalCaseCreated>;

/** Everything the Evals tab of an agent shows, in one poll. */
export const EvalAgentOverview = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  cases: z.array(EvalCaseRow), // newest first
  runs: z.array(EvalRunRecord), // newest first
});
export type EvalAgentOverview = z.infer<typeof EvalAgentOverview>;

export const EvalCaseRef = z.object({
  case_id: z.string(),
  name: z.string(),
  type: EvalExpectationType,
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
});
export type EvalCaseRef = z.infer<typeof EvalCaseRef>;

export const EvalCaseChange = EvalCaseRef.extend({
  earlier: EvalCaseStatus,
  later: EvalCaseStatus,
});
export type EvalCaseChange = z.infer<typeof EvalCaseChange>;

export const EvalDiffLine = z.object({
  op: z.enum(['add', 'remove', 'context']),
  text: z.string(),
});
export type EvalDiffLine = z.infer<typeof EvalDiffLine>;

/** Compare of two completed runs of one agent. Deltas are later - earlier; null = n/a. */
export const EvalCompare = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  earlier: EvalRunRecord,
  later: EvalRunRecord,
  delta: z.object({
    recall: z.number().nullable(),
    precision: z.number().nullable(),
    citation_accuracy: z.number().nullable(),
    cost_usd: z.number().nullable(),
  }),
  changed: z.array(EvalCaseChange),
  added: z.array(EvalCaseRef),
  removed: z.array(EvalCaseRef),
  prompt: z.object({
    status: z.enum(['changed', 'unchanged', 'unavailable']),
    unavailable_versions: z.array(z.number().int()),
    lines: z.array(EvalDiffLine),
  }),
  skills: z.object({
    only_earlier: z.array(EvalRunSkill),
    only_later: z.array(EvalRunSkill),
    reordered: z.boolean(),
  }),
});
export type EvalCompare = z.infer<typeof EvalCompare>;

/** One point on the dashboard trend (per run, chronological). */
export const EvalTrendPoint = z.object({
  started_at: z.string(),
  recall: EvalMetric,
  precision: EvalMetric,
  citation_accuracy: EvalMetric,
  cost_usd: z.number().nullable(),
});
export type EvalTrendPoint = z.infer<typeof EvalTrendPoint>;

/** Workspace dashboard: agents that have an eval set + the latest runs. */
export const EvalDashboard = z.object({
  agents: z.array(
    z.object({
      agent_id: z.string(),
      name: z.string(),
      enabled: z.boolean(),
      cases_total: z.number().int(),
      latest: EvalRunRecord.nullable(),
    }),
  ),
  recent_runs: z.array(EvalRunRecord), // <= 10, newest first
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  // Bounds: the artifact is untrusted input (AC-10). Maxima are generous, finite caps.
  findings_count: z.number().int().min(0).max(10_000),
  critical: z.number().int().min(0).max(10_000).nullish(),
  warning: z.number().int().min(0).max(10_000).nullish(),
  suggestion: z.number().int().min(0).max(10_000).nullish(),
  cost_usd: z.number().min(0).max(1_000).nullable(),
  duration_ms: z.number().int().min(0).max(86_400_000).nullish(), // 24 h
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().positive().max(2_147_483_647).nullish(), // int4 max
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
