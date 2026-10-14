/* hooks/skills.ts — React Query hooks for the Skills Lab: skill CRUD, the
   immutable version history, file/zip import, and an agent's ordered links.
   Every call goes through src/lib/api.ts; components never fetch. */
"use client";

import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AgentSkillLink,
  Skill,
  SkillImportPreview,
  SkillType,
  SkillVersion,
  SkillWithUsage,
} from "@devdigest/shared";

/** Query keys, in one place so an invalidation cannot drift from a fetch. */
export const skillKeys = {
  all: ["skills"] as const,
  one: (id: string | null | undefined) => ["skill", id] as const,
  versions: (id: string | null | undefined) => ["skill", id, "versions"] as const,
  version: (id: string | null | undefined, v: number | null | undefined) =>
    ["skill", id, "versions", v] as const,
  agentSkills: (agentId: string | null | undefined) => ["agents", agentId, "skills"] as const,
};

// ---- Reads ----

/** Every skill in the workspace, with how many agents link it (name ascending). */
export function useSkills() {
  return useQuery({
    queryKey: skillKeys.all,
    queryFn: () => api.get<SkillWithUsage[]>("/skills"),
  });
}

export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.one(id),
    queryFn: () => api.get<Skill>(`/skills/${id}`),
    enabled: !!id,
  });
}

/** Immutable body snapshots, newest version first. */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/** One snapshot — fetched lazily, only while a Diff modal is open. */
export function useSkillVersion(id: string | null | undefined, version: number | null | undefined) {
  return useQuery({
    queryKey: skillKeys.version(id, version),
    queryFn: () => api.get<SkillVersion>(`/skills/${id}/versions/${version}`),
    enabled: !!id && version != null,
  });
}

// ---- Writes ----

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSkillInput) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

export interface UpdateSkillInput {
  id: string;
  patch: Partial<Pick<Skill, "name" | "description" | "type" | "body" | "enabled">>;
}

/**
 * Update a skill. The grid's `enabled` toggle is optimistic: the card flips
 * instantly and the cached list is rolled back if the PUT fails.
 */
export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onMutate: async ({ id, patch }: UpdateSkillInput) => {
      await qc.cancelQueries({ queryKey: skillKeys.all });
      const previous = qc.getQueryData<SkillWithUsage[]>(skillKeys.all);
      if (previous) {
        qc.setQueryData<SkillWithUsage[]>(
          skillKeys.all,
          previous.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        );
      }
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(skillKeys.all, ctx.previous);
    },
    onSuccess: (data) => qc.setQueryData(skillKeys.one(data.id), data),
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(vars.id) });
    },
  });
}

export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/skills/${id}`),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.removeQueries({ queryKey: skillKeys.one(id) });
      // Deleting a skill drops its agent_skills rows, so every agent's link
      // list and skill count moves with it.
      qc.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export interface RestoreSkillVersionInput {
  id: string;
  version: number;
}

/** Re-apply an old body as a NEW version — history is never rewritten. */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: RestoreSkillVersionInput) =>
      api.post<Skill>(`/skills/${id}/restore`, { version }),
    onSuccess: (data) => {
      qc.setQueryData(skillKeys.one(data.id), data);
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.versions(data.id) });
    },
  });
}

// ---- Import from file / zip (multipart) ----

/** Parse an uploaded .md/.zip and return its core. Persists NOTHING. */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api.postForm<SkillImportPreview>("/skills/import/preview", form);
    },
  });
}

export interface ImportSkillInput {
  file: File;
  name?: string;
  description?: string;
  type?: SkillType;
}

/** Persist the upload, honouring the fields the user corrected in the preview. */
export function useImportSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name, description, type }: ImportSkillInput) => {
      const form = new FormData();
      form.append("file", file);
      if (name != null) form.append("name", name);
      if (description != null) form.append("description", description);
      if (type != null) form.append("type", type);
      return api.postForm<Skill>("/skills/import", form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

// ---- Agent ↔ skill links ----

/** An agent's linked skills, in `agent_skills.order` — the prompt order. */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.agentSkills(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * How many skills each agent has attached, for the `{n} skills` badge on the
 * /agents tiles. There is no aggregate endpoint, so this is one `GET
 * /agents/:id/skills` per tile — but under the very query key `useAgentSkills`
 * uses, so opening that agent's Skills tab afterwards is already warm.
 *
 * `useQueries` is a single hook over a variable-length list, so the array may
 * change between renders without breaking the rules of hooks.
 */
export function useAgentSkillCounts(agentIds: string[]): Record<string, number> {
  return useQueries({
    queries: agentIds.map((id) => ({
      queryKey: skillKeys.agentSkills(id),
      queryFn: () => api.get<AgentSkillLink[]>(`/agents/${id}/skills`),
      staleTime: 30_000,
    })),
    combine: (results) => {
      const counts: Record<string, number> = {};
      results.forEach((r, i) => {
        const id = agentIds[i];
        if (id != null && r.data) counts[id] = r.data.length;
      });
      return counts;
    },
  });
}

/**
 * Replace the agent's whole link set. Attach, detach and reorder are all this
 * one call with the full ordered id list — `order` is the array index.
 */
export function useSetAgentSkills(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onSuccess: (links) => {
      qc.setQueryData(skillKeys.agentSkills(agentId), links);
      // Both counters move: the agent tile's "{n} skills" and each card's
      // agent_count on the Skills grid.
      qc.invalidateQueries({ queryKey: ["agents"] });
      qc.invalidateQueries({ queryKey: skillKeys.all });
    },
  });
}
