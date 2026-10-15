import type { ProjectContextTag } from "@devdigest/shared";

/** Prompt order of the tags. */
export const TAG_ORDER: ProjectContextTag[] = ["specs", "docs", "insights"];

/** Token budget of one `## Project context` section (mirrors the server's). */
export const SECTION_TOKEN_BUDGET = 8000;
