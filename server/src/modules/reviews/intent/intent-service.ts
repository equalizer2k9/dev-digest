import { randomUUID } from 'node:crypto';
import { assembleIntentPrompt, deriveIntent } from '@devdigest/reviewer-core';
import type { IntentSource, PrIntentDetail, Provider, UnifiedDiff } from '@devdigest/shared';
import type { Container } from '../../../platform/container.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../../platform/errors.js';
import { logLlmCall, logPromptAssembly } from '../../../platform/prompt-log.js';
import type { PinoLike } from '../../../platform/run-logger.js';
import { resolveFeatureModel } from '../../settings/feature-models.js';
import { loadDiff } from '../diff-loader.js';
import type { IntentRecord, PullRow, RepoRow, ReviewRepository } from '../repository.js';
import { collectSources } from './collect-sources.js';
import { INTENT_FEATURE } from './constants.js';

/** Wraps the model-calling part so the executor can show it as its own Live Log step. */
export type StepRunner = <T>(label: string, fn: () => Promise<T>) => Promise<T>;

export type EnsureOutcome =
  | { outcome: 'reused'; detail: PrIntentDetail }
  /** `joined`: another trigger was already deriving it; this one shared that call. */
  | { outcome: 'derived'; detail: PrIntentDetail; joined?: true }
  | { outcome: 'failed'; error: string };

/** Derivations in flight, keyed by PR — two concurrent triggers share one call. */
const inFlight = new Map<string, Promise<PrIntentDetail>>();

export function toDetail(prId: string, rec: IntentRecord, currentHeadSha: string): PrIntentDetail {
  return {
    ...rec.intent,
    pr_id: prId,
    confidence: rec.confidence,
    sources: rec.sources,
    provider: rec.provider,
    model: rec.model,
    head_sha: rec.headSha,
    generated_at: rec.generatedAt ? rec.generatedAt.toISOString() : null,
    stale: rec.headSha !== null && rec.headSha !== currentHeadSha,
  };
}

/** HTTP-ish status carried by an SDK error (or its cause), if any. */
function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; cause?: unknown } | null;
  for (const v of [e?.status, e?.statusCode]) if (typeof v === 'number') return v;
  return e?.cause && e.cause !== err ? statusOf(e.cause) : undefined;
}

/**
 * Provider failure → the API error the spec asks for (402 / 404 / other → 502).
 * The messages are fixed: the provider's own text never reaches a client or a log.
 */
export function mapProviderError(err: unknown, provider: string, model: string): Error {
  if (err instanceof AppError && err.code === 'config_error') return err;
  const status = statusOf(err);
  if (status === 402) {
    return new AppError('llm_payment_required', `${provider} reported insufficient credit`, 402);
  }
  if (status === 404) {
    return new AppError('llm_model_not_found', `${provider} has no model "${model}"`, 502);
  }
  if (err instanceof AppError) return err;
  return new ExternalServiceError('Intent classifier call failed');
}

/**
 * Derives, stores and serves a PR's intent. The model comes ONLY from the
 * `review_intent` feature setting. One classifier call per derivation; its
 * tokens and cost live on the `pr_intent` row, not on any agent run.
 */
export class IntentService {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
  ) {}

  /** The stored intent, or null — never calls a model. */
  async get(workspaceId: string, prId: string): Promise<PrIntentDetail | null> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const rec = await this.repo.getIntentRecord(prId);
    return rec ? toDetail(prId, rec, pull.headSha) : null;
  }

  /** Re-derive with exactly one model call; a failure leaves the stored row untouched. */
  async recalculate(
    workspaceId: string,
    prId: string,
    logger?: PinoLike,
    correlationId: string = randomUUID(),
  ): Promise<PrIntentDetail> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await this.repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, this.repo, workspaceId, pull, repoRow);
    return this.deriveShared(workspaceId, pull, repoRow, diff, logger, correlationId);
  }

  /**
   * Before a review: reuse the stored row (even if stale), else derive once.
   * Never throws — a failure comes back as `{ outcome: 'failed' }`.
   */
  async ensureForReview(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    logger: PinoLike | undefined,
    correlationId: string,
    runStep?: StepRunner,
  ): Promise<EnsureOutcome> {
    try {
      const stored = await this.repo.getIntentRecord(pull.id);
      if (stored) return { outcome: 'reused', detail: toDetail(pull.id, stored, pull.headSha) };
      const joined = inFlight.has(pull.id);
      const detail = await this.deriveShared(
        workspaceId,
        pull,
        repoRow,
        diff,
        logger,
        correlationId,
        runStep,
      );
      return joined ? { outcome: 'derived', detail, joined: true } : { outcome: 'derived', detail };
    } catch (err) {
      return { outcome: 'failed', error: (err as Error).message };
    }
  }

  private deriveShared(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    logger: PinoLike | undefined,
    correlationId: string,
    runStep?: StepRunner,
  ): Promise<PrIntentDetail> {
    const running = inFlight.get(pull.id);
    if (running) return running;
    const p = this.derive(workspaceId, pull, repoRow, diff, logger, correlationId, runStep).finally(
      () => inFlight.delete(pull.id),
    );
    inFlight.set(pull.id, p);
    return p;
  }

  private async derive(
    workspaceId: string,
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    logger: PinoLike | undefined,
    correlationId: string,
    runStep?: StepRunner,
  ): Promise<PrIntentDetail> {
    const { provider, model } = await resolveFeatureModel(this.container, workspaceId, INTENT_FEATURE);
    // The error is mapped inside the step, so the Live Log and the persisted trace get the fixed
    // message too — never the provider's own text.
    const run = async () => {
      try {
        return await this.callClassifier(pull, repoRow, diff, provider, model, logger, correlationId);
      } catch (err) {
        logger?.warn(
          { event: 'intent_classifier_failed', correlationId, prId: pull.id, provider, model, status: statusOf(err) ?? null },
          'intent classifier call failed',
        );
        throw mapProviderError(err, provider, model);
      }
    };
    return runStep ? runStep(`Deriving PR intent (${provider}/${model})`, run) : run();
  }

  private async callClassifier(
    pull: PullRow,
    repoRow: RepoRow,
    diff: UnifiedDiff,
    provider: string,
    model: string,
    logger: PinoLike | undefined,
    correlationId: string,
  ): Promise<PrIntentDetail> {
    // Throws ConfigError when the provider key is missing — before any other work.
    const llm = await this.container.llm(provider as Provider);
    const repoRef = { owner: repoRow.owner, name: repoRow.name };
    const collected = await collectSources({ container: this.container, repo: repoRef, pull, diff });
    const countTokens = (t: string) => this.container.tokenizer.count(t);
    const input = {
      title: pull.title,
      description: pull.body,
      issues: collected.issues,
      files: collected.files,
      outline: collected.outline,
      countTokens,
    };

    // Assembly line first (the same pure assembly deriveIntent runs), so a failed
    // call is still visible in the log.
    // Previews only in verbose local logging; otherwise no text is computed at all.
    const verbose = this.container.config?.promptLogVerbose === true;
    const assembled = assembleIntentPrompt(verbose ? { ...input, includePreviews: true } : input);
    const ids = { correlationId, prId: pull.id, provider, model };
    logPromptAssembly(logger, {
      call: 'intent_classifier',
      ...ids,
      sections: assembled.sections,
      totalTokens: assembled.totalTokens,
      ...(verbose
        ? {
            verbose: true,
            previews: assembled.sections.map((s) => ({ name: s.name, text: s.preview ?? '' })),
          }
        : {}),
    });

    const t0 = Date.now();
    const res = await deriveIntent({
      llm,
      model,
      ...input,
      sessionId: `${repoRow.owner}/${repoRow.name}#${pull.number}:intent`,
    });
    logLlmCall(logger, {
      call: 'intent_classifier',
      ...ids,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
      durationMs: Date.now() - t0,
    });

    const sources = markTruncated(collected.sources, res.truncated);
    const rec: IntentRecord = {
      intent: res.intent,
      confidence: res.confidence,
      sources,
      provider,
      model,
      headSha: pull.headSha,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      costUsd: res.costUsd,
      generatedAt: new Date(),
    };
    await this.repo.saveIntentRecord(pull.id, rec);
    return toDetail(pull.id, rec, pull.headSha);
  }
}

/** Map reviewer-core's cut keys onto the matching `sources` entries. */
function markTruncated(sources: IntentSource[], truncated: string[]): IntentSource[] {
  if (truncated.length === 0) return sources;
  const keyOf = (s: IntentSource): string | null => {
    if (s.kind === 'spec_file') return `spec_file:${s.ref}`;
    if (s.kind === 'linked_issue') return `linked_issue:${s.ref.replace(/^#/, '')}`;
    if (s.kind === 'changed_files') return 'changed_files';
    if (s.kind === 'pr_description') return 'pr_description';
    return null;
  };
  return sources.map((s) => {
    const k = keyOf(s);
    return k && s.status === 'used' && truncated.includes(k) ? { ...s, reason: 'truncated' } : s;
  });
}
