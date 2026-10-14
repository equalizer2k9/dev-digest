/* hooks/conventions.ts — React Query hooks for the Conventions Extractor:
   run/re-run the scan, review the candidates it returns, and merge the accepted
   ones into a skill. Every call goes through src/lib/api.ts; components never
   fetch.

   Contract types come from the CLIENT copy of @devdigest/shared as types only —
   a runtime import of the vendored barrel breaks the webpack build (see
   src/lib/feature-models.ts for the same workaround on FEATURE_MODELS). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillDraft,
  ConventionStatus,
  Skill,
  SkillType,
} from "@devdigest/shared";

/** Query keys, in one place so an invalidation cannot drift from a fetch. */
export const conventionKeys = {
  list: (repoId: string | null | undefined) => ["conventions", repoId] as const,
  draft: (repoId: string | null | undefined) => ["conventions", repoId, "draft"] as const,
};

// ---- Reads ----

/**
 * GET /repos/:id/conventions → the visible candidates (pending + accepted,
 * confidence descending) plus what the latest scan did. `extracted_at` is null
 * when the repo has never been scanned — that is what splits `Run Scan` from
 * `ReScan`.
 */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionScan>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * GET /repos/:id/conventions/draft → the skill the ACCEPTED candidates merge
 * into, built server-side. Fetched only while the create modal is open, and
 * never served stale: accepting one more convention must change the body.
 */
export function useConventionDraft(repoId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: conventionKeys.draft(repoId),
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/draft`),
    enabled: !!repoId && enabled,
    staleTime: 0,
  });
}

// ---- Writes ----

/**
 * POST /repos/:id/conventions/extract → one synchronous model round-trip that
 * can take tens of seconds; the response replaces the cached scan. A rescan is
 * the same endpoint (the server merges, keeping rejected tombstones).
 */
export function useExtractConventions(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScan>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (scan) => {
      qc.setQueryData(conventionKeys.list(repoId), scan);
      qc.invalidateQueries({ queryKey: conventionKeys.draft(repoId) });
    },
  });
}

export interface ConventionPatch {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface UpdateConventionInput {
  id: string;
  patch: ConventionPatch;
}

/**
 * Apply a patch to the cached scan the way the server will: a `rejected` row
 * leaves the list for good (the server never returns rejected rows), anything
 * else is edited in place with `accepted` kept in lockstep with `status`.
 */
function applyPatch(scan: ConventionScan, id: string, patch: ConventionPatch): ConventionScan {
  if (patch.status === "rejected") {
    return { ...scan, candidates: scan.candidates.filter((c) => c.id !== id) };
  }
  return {
    ...scan,
    candidates: scan.candidates.map((c) =>
      c.id === id
        ? { ...c, ...patch, ...(patch.status ? { accepted: patch.status === "accepted" } : {}) }
        : c,
    ),
  };
}

/**
 * PUT /conventions/:id — accept/reject toggle and the in-place rule/category
 * edit, all optimistic: the card moves before the round-trip and the whole
 * cached scan is rolled back if the write fails. Callers add their own
 * translated toast through `mutate(vars, { onError })`.
 */
export function useUpdateConvention(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) =>
      api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }: UpdateConventionInput) => {
      const key = conventionKeys.list(repoId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionScan>(key);
      if (previous) qc.setQueryData<ConventionScan>(key, applyPatch(previous, id, patch));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(conventionKeys.list(repoId), ctx.previous);
    },
    onSuccess: (updated, { patch }: UpdateConventionInput) => {
      // A rejected row stays gone; everything else adopts the server's row so a
      // normalized rule or category is what the card ends up showing.
      if (patch.status === "rejected") return;
      const key = conventionKeys.list(repoId);
      const current = qc.getQueryData<ConventionScan>(key);
      if (!current) return;
      qc.setQueryData<ConventionScan>(key, {
        ...current,
        candidates: current.candidates.map((c) => (c.id === updated.id ? updated : c)),
      });
    },
    onSettled: () => {
      // The draft body is built from the accepted rows, so any decision stales it.
      qc.invalidateQueries({ queryKey: conventionKeys.draft(repoId) });
    },
  });
}

export interface CreateConventionSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  enabled?: boolean;
  body: string;
  /** Present only when the user picked an agent to link the new skill to. */
  agent_id?: string;
}

/**
 * POST /repos/:id/conventions/skill → the merged skill, `source: "extracted"`.
 * Sends the EDITED values, not the draft's originals, so the Skills grid and
 * (when linked) the agent's Skills tab both need a refresh afterwards.
 */
export function useCreateConventionSkill(repoId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (_skill, input: CreateConventionSkillInput) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      if (input.agent_id) {
        qc.invalidateQueries({ queryKey: ["agents"] });
        qc.invalidateQueries({ queryKey: ["agents", input.agent_id, "skills"] });
      }
    },
  });
}
