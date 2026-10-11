import { z } from 'zod';

// Minimal shapes of the API responses — only the fields the tools read.
// Declared here on purpose: this package imports nothing from server/ or client/.

export const AgentRow = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  enabled: z.boolean(),
  provider: z.string(),
  model: z.string(),
});
export type AgentRow = z.infer<typeof AgentRow>;
export const AgentList = z.array(AgentRow);

export const RepoRow = z.object({ id: z.string(), full_name: z.string() });
export type RepoRow = z.infer<typeof RepoRow>;
export const RepoList = z.array(RepoRow);

export const PullRow = z.object({ id: z.string(), number: z.number().int() });
export type PullRow = z.infer<typeof PullRow>;
export const PullList = z.array(PullRow);

export const StartedRuns = z.object({
  runs: z.array(z.object({ run_id: z.string() })),
});

export const RunRow = z.object({
  run_id: z.string(),
  // The API allows null (RunSummary.status); the tool treats it as "still running".
  status: z.string().nullish(),
  error: z.string().nullish(),
});
export type RunRow = z.infer<typeof RunRow>;
export const RunList = z.array(RunRow);

export const FindingRow = z.object({
  severity: z.string(),
  title: z.string(),
  file: z.string().nullish(),
  start_line: z.number().nullish(),
});
export type FindingRow = z.infer<typeof FindingRow>;

export const ReviewRow = z.object({
  run_id: z.string().nullish(),
  // ReviewRecord: agent_id nullable, agent_name nullish (agent deleted / run gone).
  agent_id: z.string().nullish(),
  agent_name: z.string().nullish(),
  verdict: z.string().nullish(),
  summary: z.string().nullish(),
  score: z.number().nullish(),
  created_at: z.string(),
  findings: z.array(FindingRow),
});
export type ReviewRow = z.infer<typeof ReviewRow>;
export const ReviewList = z.array(ReviewRow);

export const ConventionCandidate = z.object({
  rule: z.string(),
  category: z.string(),
  status: z.string(),
  evidence_path: z.string(),
  evidence_start_line: z.number(),
});
export const ConventionsResponse = z.object({ candidates: z.array(ConventionCandidate) });
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

// GET /pulls/:id/blast — BlastRadiusResponse
export const BlastResponse = z.object({
  summary: z.string(),
  degraded: z.boolean(),
  reason: z.string().nullable(),
  downstream: z.array(
    z.object({
      symbol: z.string(),
      callers: z.array(z.object({ name: z.string(), file: z.string(), line: z.number() })),
      endpoints_affected: z.array(z.string()),
      crons_affected: z.array(z.string()),
    }),
  ),
});
export type BlastResponse = z.infer<typeof BlastResponse>;
