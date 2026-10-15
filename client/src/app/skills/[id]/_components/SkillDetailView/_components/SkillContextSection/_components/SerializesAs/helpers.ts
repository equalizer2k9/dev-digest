import type { ProjectContextDocument, ProjectContextTag } from "@devdigest/shared";
import { SECTION_TOKEN_BUDGET, TAG_ORDER } from "./constants";

export interface SerializedDoc {
  path: string;
  tokens: number;
  overBudget: boolean;
}

export interface SerializedGroup {
  tag: ProjectContextTag;
  docs: SerializedDoc[];
}

/**
 * Group the attached paths by tag (specs, docs, insights; attachment order
 * within a tag) and mark each document past the cumulative budget. Once one
 * goes over, every later one is over too — as the run skips them.
 * Paths missing from the listing are left out; empty groups are dropped.
 */
export function serializeGroups(attached: string[], documents: ProjectContextDocument[]): SerializedGroup[] {
  const byPath = new Map(documents.map((d) => [d.path, d]));
  let sum = 0;
  let over = false;
  const groups: SerializedGroup[] = [];
  for (const tag of TAG_ORDER) {
    const docs: SerializedDoc[] = [];
    for (const path of attached) {
      const d = byPath.get(path);
      if (!d || d.tag !== tag) continue;
      const tokens = d.tokens ?? 0;
      sum += tokens;
      if (sum > SECTION_TOKEN_BUDGET) over = true;
      docs.push({ path, tokens, overBudget: over });
    }
    if (docs.length > 0) groups.push({ tag, docs });
  }
  return groups;
}
