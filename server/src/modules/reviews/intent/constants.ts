/**
 * Intent layer caps. Everything the classifier is fed is bounded here, so a
 * hostile or huge PR cannot grow the prompt (or the work to build it).
 */
export const INTENT_FEATURE = 'review_intent' as const;

/** At most this many linked issues are fetched. */
export const MAX_ISSUES = 3;
/** At most this many referenced plan / spec files are read. */
export const MAX_SPEC_FILES = 3;
/** Larger files are skipped, not read into the prompt (recorded as `too_large`). */
export const MAX_SPEC_FILE_CHARS = 20_000;
/**
 * Pre-read cap in BYTES, enforced by the git / GitHub readers before any text
 * exists. UTF-8 is at most 4 bytes per char, so this is the largest size a file
 * of MAX_SPEC_FILE_CHARS chars can have: it never rejects a file the char cap
 * would accept, and the exact char check runs on what was read (the two differ
 * only for multi-byte text).
 */
export const MAX_SPEC_FILE_BYTES = MAX_SPEC_FILE_CHARS * 4;
/** At most this many refused file references are recorded in `sources`. */
export const MAX_REJECTED_REFS = 5;
/** Display cap for a recorded refused reference. */
export const MAX_REJECTED_REF_CHARS = 120;
/** Only these extensions are ever read from a reference. */
export const ALLOWED_EXTENSIONS = ['.md'] as const;
/** PR description cap (mirrors the reviewer prompt's). */
export const MAX_DESCRIPTION_CHARS = 4000;

/** Changed-file outline caps. */
export const MAX_OUTLINE_FILES = 60;
export const MAX_OUTLINE_HUNKS_PER_FILE = 8;
export const MAX_HUNK_HEADER_CHARS = 160;
export const MAX_OUTLINE_CHARS = 6000;
