import type { FastifyBaseLogger } from 'fastify';
import { PrBrief, PrBriefDraft, type PrBriefResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  NotFoundError,
} from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { TimeoutError, withTimeout } from '../../platform/resilience.js';
import { BlastService } from '../blast/service.js';
import { IntentService } from '../reviews/intent/intent-service.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import {
  BRIEF_FAILURE_MESSAGE,
  BRIEF_FEATURE,
  BRIEF_INPUT_TOKEN_BUDGET,
  MAX_CHARS_PER_TOKEN,
  BRIEF_NO_FILES_CODE,
  BRIEF_SCHEMA_NAME,
  BRIEF_SYSTEM_PROMPT,
  BRIEF_TIMEOUT_MS,
  MODEL_MAX_RETRIES,
  MODEL_MAX_TOKENS,
  MODEL_TEMPERATURE,
  type BriefFailureReason,
} from './constants.js';
import {
  type BriefDocument,
  type BriefIntentFacts,
  buildBriefInput,
  buildFacts,
  composeSystem,
  groundDraft,
  rowPath,
} from './helpers.js';
import { BriefRepository } from './repository.js';

/**
 * PR Brief: computed facts → ONE structured model call → grounding → one stored
 * row per PR. Facts and grounding are code (helpers.ts); the model only writes
 * the summary, risks and review focus. A failed generation stores nothing.
 */
export class BriefService {
  private repo: BriefRepository;

  constructor(
    private container: Container,
    private log: FastifyBaseLogger,
  ) {
    this.repo = new BriefRepository(container.db);
  }

  /**
   * The stored brief, or `{ brief: null }`. The workspace-scoped pull lookup runs
   * first, so "no row" is never confused with "no such PR". A row that no longer
   * fits the contract is served as "none" (and warned about), never as a 500.
   */
  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    await this.requirePull(workspaceId, prId);
    const json = await this.repo.get(workspaceId, prId);
    if (json === undefined) return { brief: null };
    const parsed = PrBrief.safeParse(json);
    if (!parsed.success) {
      this.log.warn({ prId }, 'brief: stored row does not match the contract, served as none');
      return { brief: null };
    }
    return { brief: parsed.data };
  }

  /** One generation, stored with the head SHA the page showed (`headSha`). */
  async generate(workspaceId: string, prId: string, headSha: string): Promise<PrBriefResponse> {
    const { reviewRepo } = this.container;
    const pull = await this.requirePull(workspaceId, prId);

    // Stored files only: the refusal never tries a GitHub refresh.
    const files = await reviewRepo.getPrFiles(prId);
    if (files.length === 0) {
      throw new AppError(
        BRIEF_NO_FILES_CODE,
        'This pull request has no recorded changed files, so there is nothing to brief',
        409,
      );
    }

    // Blast is optional context: on a throw the brief proceeds on PR files only.
    let blast: Awaited<ReturnType<BlastService['forPull']>> | null = null;
    try {
      blast = await new BlastService(this.container, this.log).forPull(workspaceId, prId);
    } catch (err) {
      this.log.warn({ err, prId }, 'brief: blast radius unavailable, using PR files only');
    }

    // The stored intent is read, never derived (AC-32): no model call here.
    let intent: BriefIntentFacts | null = null;
    try {
      const detail = await new IntentService(this.container, reviewRepo).get(workspaceId, prId);
      if (detail) {
        intent = {
          intent: detail.intent,
          in_scope: detail.in_scope,
          out_of_scope: detail.out_of_scope,
          confidence: detail.confidence,
          stale: detail.stale,
        };
      }
    } catch (err) {
      this.log.warn({ prId, err }, 'brief: stored intent unavailable, generating without one');
    }

    // Attached project documents: optional context, paths and reasons only in logs.
    let documents: BriefDocument[] = [];
    let skipped: { path: string; reason: string }[] = [];
    try {
      const ctx = await this.container.projectContext.forBrief(
        workspaceId,
        pull.repoId,
        BRIEF_INPUT_TOKEN_BUDGET * MAX_CHARS_PER_TOKEN,
      );
      documents = ctx.documents.map((d) => ({ path: d.path, text: d.content }));
      skipped = ctx.skipped;
    } catch (err) {
      this.log.warn({ prId, err }, 'brief: project documents unavailable, generating without them');
    }

    const facts = buildFacts(pull, files, blast, intent, documents);
    const system = composeSystem(await renderPrompt(BRIEF_SYSTEM_PROMPT, {}));
    const input = buildBriefInput(
      facts,
      system,
      (text) => this.container.tokenizer.count(text),
      BRIEF_INPUT_TOKEN_BUDGET,
    );

    // Code-only work is done: only now resolve the model (and so the API key).
    const choice = await resolveFeatureModel(this.container, workspaceId, BRIEF_FEATURE);

    let outcome: 'stored' | 'failed' = 'failed';
    try {
      const draft = await this.callModel(choice, input.system, input.user);
      const brief: PrBrief = {
        ...groundDraft(draft, facts),
        head_sha: headSha,
        // Only what the model was actually given: null when the budget cut the section.
        intent:
          intent && input.intentIncluded
            ? { intent: intent.intent, in_scope: intent.in_scope, out_of_scope: intent.out_of_scope }
            : null,
        history: null,
        context_docs: input.documentPaths,
      };
      await this.repo.upsert(prId, brief);
      outcome = 'stored';
      return { brief };
    } finally {
      this.log.info(
        {
          prId,
          provider: choice.provider,
          model: choice.model,
          inputTokens: input.tokens,
          outcome,
          contextDocs: input.documentPaths.length,
          contextDocsDropped: documents.length - input.documentPaths.length,
          contextDocsSkipped: skipped.map((s) => ({ path: rowPath(s.path), reason: s.reason })),
        },
        'brief: generation',
      );
    }
  }

  private async requirePull(workspaceId: string, prId: string) {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    return pull;
  }

  /**
   * The ONE model request. Any failure becomes a single ExternalServiceError with
   * a fixed message and `{ reason }` only: the adapter error carries the raw reply
   * and the error handler sends `details` to the client.
   */
  private async callModel(
    choice: { provider: Parameters<Container['llm']>[0]; model: string },
    system: string,
    user: string,
  ): Promise<PrBriefDraft> {
    try {
      const llm = await this.container.llm(choice.provider);
      const result = await withTimeout(
        llm.completeStructured({
          model: choice.model,
          schema: PrBriefDraft,
          schemaName: BRIEF_SCHEMA_NAME,
          temperature: MODEL_TEMPERATURE,
          maxTokens: MODEL_MAX_TOKENS,
          timeoutMs: BRIEF_TIMEOUT_MS,
          maxRetries: MODEL_MAX_RETRIES,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        BRIEF_TIMEOUT_MS,
      );
      return result.data;
    } catch (err) {
      throw new ExternalServiceError(BRIEF_FAILURE_MESSAGE, { reason: failureReason(err) });
    }
  }
}

function failureReason(err: unknown): BriefFailureReason {
  if (err instanceof ConfigError) return 'no_api_key';
  if (err instanceof TimeoutError) return 'timeout';
  if (err instanceof ExternalServiceError) {
    const details = err.details as { raw?: unknown } | undefined;
    if (details && typeof details === 'object' && 'raw' in details) return 'invalid_reply';
  }
  return 'provider_error';
}
