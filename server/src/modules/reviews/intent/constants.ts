/**
 * Intent layer caps. Everything the classifier is fed is bounded here, so a
 * hostile or huge PR cannot grow the prompt (or the work to build it).
 */
export const INTENT_FEATURE = 'review_intent' as const;

/** At most this many linked issues are fetched. */
export const MAX_ISSUES = 3;
/** At most this many referenced plan / spec files are read. */
export const MAX_SPEC_FILES = 3;
/** Larger files are not read into the prompt (recorded as truncated). */
export const MAX_SPEC_FILE_CHARS = 20_000;
/** Only these extensions are ever read from a reference. */
export const ALLOWED_EXTENSIONS = ['.md'] as const;
/** PR description cap (mirrors the reviewer prompt's). */
export const MAX_DESCRIPTION_CHARS = 4000;

/** Changed-file outline caps. */
export const MAX_OUTLINE_FILES = 60;
export const MAX_OUTLINE_HUNKS_PER_FILE = 8;
export const MAX_HUNK_HEADER_CHARS = 160;
export const MAX_OUTLINE_CHARS = 6000;
