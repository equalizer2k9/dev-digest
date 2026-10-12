import { z } from 'zod';
import { Intent } from './brief.js';

/**
 * Intent layer — what the system believes a PR is for, how sure it is, and what
 * it was derived from. `Intent` (brief.ts) is reused unchanged: its `intent`
 * field is the summary.
 */

export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const IntentSource = z.object({
  kind: z.enum(['pr_title', 'pr_description', 'linked_issue', 'spec_file', 'changed_files']),
  ref: z.string(),
  status: z.enum(['used', 'missing', 'skipped']),
  reason: z.string().optional(),
});
export type IntentSource = z.infer<typeof IntentSource>;

export const PrIntentDetail = Intent.extend({
  pr_id: z.string().uuid(),
  confidence: IntentConfidence,
  sources: z.array(IntentSource),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  head_sha: z.string().nullable(),
  generated_at: z.string().nullable(),
  /** true when the PR head moved since the intent was derived. */
  stale: z.boolean(),
});
export type PrIntentDetail = z.infer<typeof PrIntentDetail>;

export const PrIntentResponse = z.object({
  intent: PrIntentDetail.nullable(),
});
export type PrIntentResponse = z.infer<typeof PrIntentResponse>;
