import { z } from 'zod';

/**
 * Project context — repository documents (specs, docs, insights) an agent or
 * skill can have attached, and the record of what a run was given.
 */

export const ProjectContextTag = z.enum(['specs', 'docs', 'insights']);
export type ProjectContextTag = z.infer<typeof ProjectContextTag>;

export const ProjectContextSkipReason = z.enum([
  'missing',
  'unreadable',
  'outside_clone',
  'too_large',
  'over_budget',
]);
export type ProjectContextSkipReason = z.infer<typeof ProjectContextSkipReason>;

/** One listed document. `tokens` is null for a too-large or unreadable one. */
export const ProjectContextDocument = z.object({
  path: z.string(),
  tag: ProjectContextTag,
  tokens: z.number().int().nullable(),
  too_large: z.boolean(),
  used_by: z.number().int(),
});
export type ProjectContextDocument = z.infer<typeof ProjectContextDocument>;

export const ProjectContextList = z.object({
  has_clone: z.boolean(),
  documents: z.array(ProjectContextDocument),
  truncated: z.boolean(),
});
export type ProjectContextList = z.infer<typeof ProjectContextList>;

export const ProjectContextPreview = z.object({
  path: z.string(),
  content: z.string(),
});
export type ProjectContextPreview = z.infer<typeof ProjectContextPreview>;

/** Trace entry: an included document has `skip_reason: null` and its tokens. */
export const ProjectContextEntry = z.object({
  path: z.string(),
  tokens: z.number().int().nullable(),
  skip_reason: ProjectContextSkipReason.nullable(),
});
export type ProjectContextEntry = z.infer<typeof ProjectContextEntry>;

export const ProjectContextEffective = ProjectContextEntry.extend({
  skill: z.object({ id: z.string(), name: z.string() }).nullable(),
});
export type ProjectContextEffective = z.infer<typeof ProjectContextEffective>;

export const ProjectContextAttachments = z.object({
  repo_id: z.string(),
  attached: z.array(z.string()),
  effective: z.array(ProjectContextEffective),
});
export type ProjectContextAttachments = z.infer<typeof ProjectContextAttachments>;

/** The whole ordered path list for one owner and repository (replace, not patch). */
export const ProjectContextAttachInput = z.object({
  repo_id: z.string().uuid(),
  paths: z
    .array(z.string().min(1).max(4096))
    .max(500)
    .refine((paths) => new Set(paths).size === paths.length, { message: 'duplicate path' }),
});
export type ProjectContextAttachInput = z.infer<typeof ProjectContextAttachInput>;
