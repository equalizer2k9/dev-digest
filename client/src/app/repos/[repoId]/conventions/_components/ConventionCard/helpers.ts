/** Pure helpers for ConventionCard. */

import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { HIGH_CONFIDENCE } from "./constants";

/** `src/foo.ts:L12-L20` — the evidence box header, as the design prints it. */
export function evidenceLabel(c: ConventionCandidate): string {
  return `${c.evidence_path}:L${c.evidence_start_line}-L${c.evidence_end_line}`;
}

/**
 * The GitHub blob URL for the cited lines, pinned to the commit the scan read
 * them from. `head_sha` is the scan's head; only when the server could not
 * record one do we fall back to the repo's default branch, where the line
 * numbers may already have moved.
 */
export function evidenceHref(
  c: ConventionCandidate,
  repoFullName: string,
  defaultBranch: string,
): string {
  return githubBlobUrl(
    repoFullName,
    c.head_sha ?? defaultBranch,
    c.evidence_path,
    c.evidence_start_line,
    c.evidence_end_line,
  );
}

/** Confidence as the rounded percentage the card prints. */
export function confidencePct(confidence: number): number {
  return Math.round(confidence * 100);
}

/** Bar colour: green from `HIGH_CONFIDENCE` up, amber below it. */
export function confidenceColor(confidence: number): string {
  return confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)";
}
