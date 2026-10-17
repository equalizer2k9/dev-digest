import { z } from 'zod';
import { Severity } from './findings.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of POST /pulls/:id/multi-agent-run
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent aggregates for a period (GET /agents/:id/stats)
 *   - AgentPerformance     the workspace dashboard (GET /agent-performance); a Stats
 *                          response is by construction that agent's row of it
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

/** A finding as surfaced in a multi-agent column (subset of FindingRecord). */
export const AgentColumnFinding = z.object({
  id: z.string(),
  severity: Severity,
  category: z.string(),
  title: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  kind: z.string().nullish(),
});
export type AgentColumnFinding = z.infer<typeof AgentColumnFinding>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.enum(['done', 'failed', 'running']),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  findings: z.array(AgentColumnFinding),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** One agent's stance on a contended file:line. */
export const ConflictTake = z.object({
  agent_id: z.string(),
  persona: z.string(),
  /** Severity if the agent flagged it, or 'ignored' when it did not. */
  verdict: z.union([Severity, z.literal('ignored')]),
  note: z.string(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/**
 * A conflict = a file:line that at least one agent flagged and at least one
 * other agent (that also reviewed) did NOT, OR where agents assigned divergent
 * severities. Computed from persisted findings; not stored.
 */
export const Conflict = z.object({
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Response of POST /pulls/:id/multi-agent-run and GET /pulls/:id/multi-agent. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  pr_number: z.number().int().nullish(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int(),
  total_cost_usd: z.number().nullable(),
  columns: z.array(AgentColumn),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats) + dashboard (GET /agent-performance)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

// ---- Agent performance (SPEC-06) ----

export const PerfPeriodPreset = z.enum(['1d', '30d', 'custom']);
export type PerfPeriodPreset = z.infer<typeof PerfPeriodPreset>;

/** A real UTC calendar date, `YYYY-MM-DD`. */
export const PerfIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'not a real calendar date');
export type PerfIsoDate = z.infer<typeof PerfIsoDate>;

/** Query of both routes. `custom` <=> `from` AND `to` present; from <= to. */
export const PerfPeriodQuery = z
  .object({
    period: PerfPeriodPreset.default('30d'),
    from: PerfIsoDate.optional(),
    to: PerfIsoDate.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.period === 'custom') {
      if (!q.from || !q.to) {
        ctx.addIssue({ code: 'custom', message: 'custom period needs both from and to' });
      } else if (q.from > q.to) {
        ctx.addIssue({ code: 'custom', path: ['from'], message: 'from must not be after to' });
      }
    } else if (q.from !== undefined || q.to !== undefined) {
      ctx.addIssue({ code: 'custom', message: 'from/to are only allowed with period=custom' });
    }
  });
export type PerfPeriodQuery = z.infer<typeof PerfPeriodQuery>;

/** The resolved half-open interval `[from, to)`. */
export const PerfPeriod = z.object({
  preset: PerfPeriodPreset,
  from: z.string(),
  /** exclusive */
  to: z.string(),
});
export type PerfPeriod = z.infer<typeof PerfPeriod>;

/** `runs` counts priced runs only; `cost_usd` is the sum of their cost. */
export const PerfCostLine = z.object({
  /** null = unknown model / Deleted agent */
  key: z.string().nullable(),
  label: z.string().nullable(),
  runs: z.number().int(),
  cost_usd: z.number(),
});
export type PerfCostLine = z.infer<typeof PerfCostLine>;

export const PerfCostBreakdown = z.object({
  lines: z.array(PerfCostLine),
  unpriced_runs: z.number().int(),
});
export type PerfCostBreakdown = z.infer<typeof PerfCostBreakdown>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  period: PerfPeriod,
  runs: z.number().int(),
  priced_runs: z.number().int(),
  unpriced_runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  /** accepted + dismissed */
  decided: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  /** decided below the low-sample threshold */
  low_sample: z.boolean(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  /** average run duration */
  avg_latency_ms: z.number().nullable(),
  last_run_at: z.string().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
  by_model: PerfCostBreakdown,
});
export type AgentStats = z.infer<typeof AgentStats>;

/** A dashboard row: AgentStats without period; null ids = the Deleted agent. */
export const AgentPerformanceRow = AgentStats.omit({
  agent_id: true,
  agent_name: true,
  period: true,
}).extend({
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
});
export type AgentPerformanceRow = z.infer<typeof AgentPerformanceRow>;

/** Pooled over all counted runs, Deleted agent included. */
export const PerfTotals = z.object({
  runs: z.number().int(),
  priced_runs: z.number().int(),
  unpriced_runs: z.number().int(),
  total_cost_usd: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  decided: z.number().int(),
  accept_rate: z.number().nullable(),
});
export type PerfTotals = z.infer<typeof PerfTotals>;

export const PerfMostActive = z
  .object({ agent_id: z.string(), agent_name: z.string(), runs: z.number().int() })
  .nullable();
export type PerfMostActive = z.infer<typeof PerfMostActive>;

/** Response of GET /agent-performance. */
export const AgentPerformance = z.object({
  period: PerfPeriod,
  totals: PerfTotals,
  most_active: PerfMostActive,
  rows: z.array(AgentPerformanceRow),
  by_agent: PerfCostBreakdown,
  by_model: PerfCostBreakdown,
});
export type AgentPerformance = z.infer<typeof AgentPerformance>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
