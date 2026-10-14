/** Constants for ConventionsView. */

/** Placeholder cards rendered while `GET /repos/:id/conventions` is in flight. */
export const SKELETON_CARDS = 3;

/** Height (px) of one skeleton card — roughly a real card with its evidence box. */
export const SKELETON_CARD_HEIGHT = 150;

/** Content column width (px), per the design's Conventions screen. */
export const CONTENT_MAX_WIDTH = 880;

/**
 * The error code the extract guard answers with when neither a config nor a
 * ranked sample could be read (server spec §2). Matched on the code rather than
 * on the bare 409, so another conflict on that route cannot be mistaken for it.
 */
export const REPO_NOT_INDEXED_CODE = "repo_not_indexed";
