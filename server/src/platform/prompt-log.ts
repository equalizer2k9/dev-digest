/**
 * Structured logging of every model call's prompt assembly and result.
 *
 * The helpers accept ONLY names, sources, numbers and ids — never prompt text,
 * diff, issue or spec text, or keys — so nothing sensitive can reach the log by
 * construction. The one exception is the opt-in text preview, which is emitted at
 * `debug` and only when `verbose` is true (config: PROMPT_LOG_VERBOSE=true AND
 * NODE_ENV=development; elsewhere the flag is inert).
 */

export type PromptLogger = {
  info: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

export type PromptCall = 'intent_classifier' | 'review';

export interface PromptSectionLog {
  name: string;
  source: string;
  tokens: number;
}

interface CallIds {
  call: PromptCall;
  correlationId: string;
  prId: string;
  provider: string;
  model: string;
}

export interface PromptAssemblyEntry extends CallIds {
  sections: PromptSectionLog[];
  totalTokens: number;
  /** Section text previews — logged only when `verbose`. */
  previews?: { name: string; text: string }[];
  verbose?: boolean;
}

export interface LlmCallEntry extends CallIds {
  tokensIn: number;
  tokensOut: number;
  costUsd: number | null;
  durationMs: number;
  /** Which chunk / file the call was for (review map-reduce); a path, never text. */
  label?: string;
}

const PREVIEW_CHARS = 200;

function ids(e: CallIds) {
  return {
    call: e.call,
    correlationId: e.correlationId,
    prId: e.prId,
    provider: e.provider,
    model: e.model,
  };
}

export function logPromptAssembly(logger: PromptLogger | undefined, entry: PromptAssemblyEntry): void {
  if (!logger) return;
  logger.info(
    {
      event: 'prompt_assembly',
      ...ids(entry),
      sections: entry.sections.map((s) => ({ name: s.name, source: s.source, tokens: s.tokens })),
      totalTokens: entry.totalTokens,
    },
    `prompt assembly (${entry.call})`,
  );
  if (entry.verbose && entry.previews?.length) {
    logger.debug(
      {
        event: 'prompt_preview',
        ...ids(entry),
        previews: entry.previews.map((p) => ({ name: p.name, text: p.text.slice(0, PREVIEW_CHARS) })),
      },
      `prompt preview (${entry.call})`,
    );
  }
}

export function logLlmCall(logger: PromptLogger | undefined, entry: LlmCallEntry): void {
  if (!logger) return;
  logger.info(
    {
      event: 'llm_call',
      ...ids(entry),
      tokensIn: entry.tokensIn,
      tokensOut: entry.tokensOut,
      costUsd: entry.costUsd,
      durationMs: entry.durationMs,
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    },
    `llm call (${entry.call})`,
  );
}
