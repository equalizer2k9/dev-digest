import type { ProjectContextTag } from '@devdigest/shared';

/** Directory names that make a Markdown file a project-context document. */
export const DOCUMENT_ROOTS: readonly ProjectContextTag[] = ['specs', 'docs', 'insights'];
/** Never listed, never descended into, never attachable. */
export const IGNORED_SEGMENTS: readonly string[] = ['.git', 'node_modules'];

/** A listing holds at most this many documents. */
export const MAX_DOCUMENTS = 500;
/** The directory walk gives up after visiting this many entries. */
export const MAX_WALK_ENTRIES = 200_000;
/** A stored or requested path is at most this long. */
export const MAX_PATH_CHARS = 4096;

/**
 * Per-document caps. Defined here (onion rule: no import from another module's
 * folder); a unit test asserts they equal the Intent Layer's.
 */
export const MAX_DOCUMENT_CHARS = 20_000;
/** Pre-read cap in bytes: UTF-8 is at most 4 bytes per char. */
export const MAX_DOCUMENT_BYTES = MAX_DOCUMENT_CHARS * 4;

/** Token budget of the whole `## Project context` section of a review prompt. */
export const SECTION_TOKEN_BUDGET = 8_000;
