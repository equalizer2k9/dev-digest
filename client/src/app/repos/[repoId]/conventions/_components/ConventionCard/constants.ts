import type { ConventionCategory } from "@devdigest/shared";

/** Constants for ConventionCard. */

/**
 * The contract's `ConventionCategory` enum, mirrored as a LOCAL constant.
 *
 * The client may only import `@devdigest/shared` as types — pulling the Zod
 * enum in as a runtime value drags `vendor/shared/index.ts` into the webpack
 * bundle, whose `./contracts/*.js` re-exports Next cannot resolve (same reason
 * `lib/feature-models.ts` mirrors `FEATURE_MODELS`). Keep this list in step with
 * `vendor/shared/contracts/knowledge.ts`; the annotation makes a drift in the
 * member names a typecheck error.
 */
export const CONVENTION_CATEGORIES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "error-handling",
  "typing",
  "testing",
  "imports",
  "api",
  "style",
  "other",
];

/** At or above this confidence the bar turns green; below it, amber. */
export const HIGH_CONFIDENCE = 0.85;

/** Width (px) of the confidence bar, per the design. */
export const CONFIDENCE_BAR_WIDTH = 90;

/** Width (px) of the card's action column, per the design. */
export const ACTION_COLUMN_WIDTH = 150;

/** Rows the rule textarea gets in edit mode. */
export const RULE_EDIT_ROWS = 3;

/**
 * Bounds the server enforces on an edited rule (`rule: z.string().min(8).max(240)`
 * on `PUT /conventions/:id`), mirrored here so `Save` is simply unavailable for a
 * rule the API would reject. Without this the write leaves, 422s, and the rollback
 * discards what the user typed behind a generic toast.
 */
export const MIN_RULE_CHARS = 8;
export const MAX_RULE_CHARS = 240;
