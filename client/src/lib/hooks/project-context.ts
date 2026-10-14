/* hooks/project-context.ts — React Query hooks for the Project Context feature:
   the repository's document list, one document preview, and the ordered
   attachments of an agent or a skill. Every call goes through src/lib/api.ts. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ProjectContextAttachments,
  ProjectContextList,
  ProjectContextPreview,
} from "@devdigest/shared";

export type ContextOwner = "agent" | "skill";

/** Query keys, in one place so an invalidation cannot drift from a fetch. */
export const contextKeys = {
  list: (repoId: string | null | undefined) => ["context-documents", repoId] as const,
  document: (repoId: string | null | undefined, path: string | null | undefined) =>
    ["context-document", repoId, path] as const,
  attachmentsAll: ["context-attachments"] as const,
  attachments: (
    owner: ContextOwner,
    ownerId: string | null | undefined,
    repoId: string | null | undefined,
  ) => ["context-attachments", owner, ownerId, repoId] as const,
};

const ownerPath = (owner: ContextOwner, ownerId: string | null | undefined) =>
  `/${owner === "agent" ? "agents" : "skills"}/${ownerId}/context`;

/** Every project-context document of the repository's clone, in path order. */
export function useContextDocuments(repoId: string | null | undefined) {
  return useQuery({
    queryKey: contextKeys.list(repoId),
    queryFn: () => api.get<ProjectContextList>(`/repos/${repoId}/context`),
    enabled: !!repoId,
  });
}

/** The text of one document; idle while no path is selected. */
export function useContextDocument(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: contextKeys.document(repoId, path),
    queryFn: () =>
      api.get<ProjectContextPreview>(
        `/repos/${repoId}/context/document?path=${encodeURIComponent(path ?? "")}`,
      ),
    enabled: !!repoId && path != null,
    retry: false,
  });
}

/** The owner's attached paths plus its effective documents for one repository. */
export function useContextAttachments(
  owner: ContextOwner,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  return useQuery({
    queryKey: contextKeys.attachments(owner, ownerId, repoId),
    queryFn: () =>
      api.get<ProjectContextAttachments>(
        `${ownerPath(owner, ownerId)}?repo_id=${encodeURIComponent(repoId ?? "")}`,
      ),
    enabled: !!ownerId && !!repoId,
  });
}

/**
 * Replace the owner's whole ordered path list. Attach, detach and reorder are
 * all this one call (the server replaces, it does not patch).
 */
export function useSetContextAttachments(
  owner: ContextOwner,
  ownerId: string | null | undefined,
  repoId: string | null | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paths: string[]) =>
      api.put<ProjectContextAttachments>(ownerPath(owner, ownerId), {
        repo_id: repoId,
        paths,
      }),
    onSuccess: (data) => {
      qc.setQueryData(contextKeys.attachments(owner, ownerId, repoId), data);
      // "Used by N agents" moves, and so does every other owner's effective list
      // (a skill's documents reach its agents).
      qc.invalidateQueries({ queryKey: contextKeys.list(repoId) });
      qc.invalidateQueries({ queryKey: contextKeys.attachmentsAll });
    },
  });
}
