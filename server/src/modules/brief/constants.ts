/** Constants for the brief module (facts → one model call → grounded brief). */

import type { FeatureModelId } from '@devdigest/shared';

/** Feature id read from Settings → Models; provider and model are never named here. */
export const BRIEF_FEATURE: FeatureModelId = 'risk_brief';

/** Template under `src/prompts/` holding the instructions (no JSON shape — see reviewer-core CLAUDE.md). */
export const BRIEF_SYSTEM_PROMPT = 'brief.system.md';

/** Token budget for the WHOLE model input (system text + user message), server tokenizer. */
export const BRIEF_INPUT_TOKEN_BUDGET = 8_000;

/** Caps applied after grounding and sorting (AC-8). */
export const MAX_RISKS = 7;
export const MAX_FOCUS = 5;

/** Model call options. `maxRetries: 0` turns off the re-ask after an invalid reply (AC-13). */
export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const MODEL_TEMPERATURE = 0;
export const MODEL_MAX_TOKENS = 4_000;
export const BRIEF_TIMEOUT_MS = 20_000;
export const MODEL_MAX_RETRIES = 0;

/** Error code of the "no recorded changed files" refusal (HTTP 409). */
export const BRIEF_NO_FILES_CODE = 'brief_no_files';

/** Why a generation failed at the model stage — the only detail sent to the client. */
export type BriefFailureReason = 'no_api_key' | 'timeout' | 'invalid_reply' | 'provider_error';

export const BRIEF_FAILURE_MESSAGE = 'The brief could not be generated';

/** Labels of the `<untrusted>` blocks. */
export const LABEL_TITLE = 'pr-title';
export const LABEL_DESCRIPTION = 'pr-description';
export const LABEL_FILES = 'changed-files';
export const LABEL_CALLERS = 'blast-callers';

/** Marker ending a truncated PR title. */
export const TITLE_ELLIPSIS = '…';
