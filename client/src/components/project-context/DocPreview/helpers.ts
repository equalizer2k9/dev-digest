import type { ProjectContextDocument } from "@devdigest/shared";

export type PreviewStatus = "idle" | "loading" | "error" | "ready" | "tooLarge";

/** The path whose text to request: none for no selection or a known too-large document. */
export function previewPathFor(
  selected: string | null,
  documents: ProjectContextDocument[],
): string | null {
  const doc = documents.find((d) => d.path === selected);
  return selected !== null && !doc?.too_large ? selected : null;
}

/** Turn the selection and the preview query's state into the DocPreview status. */
export function previewStatus(
  selected: string | null,
  documents: ProjectContextDocument[],
  query: { isLoading: boolean; isError: boolean; error: unknown; data: unknown },
): PreviewStatus {
  if (selected === null) return "idle";
  if (documents.find((d) => d.path === selected)?.too_large) return "tooLarge";
  if (query.isLoading) return "loading";
  if (query.isError) {
    return (query.error as { status?: number } | null)?.status === 413 ? "tooLarge" : "error";
  }
  return query.data ? "ready" : "loading";
}
