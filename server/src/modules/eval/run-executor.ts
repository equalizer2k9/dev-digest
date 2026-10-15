import { reviewPullRequest, type SkillPart } from '@devdigest/reviewer-core';
import {
  EvalExpectation,
  EvalFrozenMeta,
  type EvalCaseResult,
  type Provider,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { AgentRow } from '../../db/rows.js';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { logLlmCall, logPromptAssembly } from '../../platform/prompt-log.js';
import { taskInstruction } from '../_shared/task-line.js';
import { EVAL_CASE_TIMEOUT_MS, MAX_ERROR_CHARS } from './constants.js';
import { withTimeout } from '../../platform/resilience.js';
import { caseErrorReason, IncompleteCaseError } from './helpers.js';
import type { EvalCaseDbRow, EvalRepository, EvalRunDbRow } from './repository.js';
import { caseStatus, countMatches, runCost, scoreRun } from './scoring.js';

/** Minimal pino-compatible logger. */
export type EvalLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

const cut = (text: string) => text.slice(0, MAX_ERROR_CHARS);

/** The same logger with the run, agent and case ids on every record. */
function withIds(logger: EvalLogger | undefined, ids: Record<string, string>): EvalLogger | undefined {
  if (!logger) return undefined;
  const wrap = (fn: EvalLogger['info']): EvalLogger['info'] =>
    (obj, msg) => fn({ ...(obj as object), ...ids }, msg);
  return {
    info: wrap(logger.info.bind(logger)),
    warn: wrap(logger.warn.bind(logger)),
    error: wrap(logger.error.bind(logger)),
    debug: wrap(logger.debug.bind(logger)),
  };
}

/**
 * Background execution of one eval run. Everything it needs (agent row, cases,
 * skills) is passed in at the start, so the run is a snapshot: edits made while it
 * goes change nothing. Cases run one after another, each through the unchanged
 * review engine with only the agent's configuration and the case's frozen input.
 * Results are written in one UPDATE at the end.
 */
export class EvalRunExecutor {
  constructor(
    private container: Container,
    private repo: EvalRepository,
    private caseTimeoutMs: number = EVAL_CASE_TIMEOUT_MS,
  ) {}

  /** Never throws: a top-level failure is stored as a failed run. */
  async execute(
    run: Pick<EvalRunDbRow, 'id'>,
    agent: AgentRow,
    cases: EvalCaseDbRow[],
    skills: SkillPart[],
    logger?: EvalLogger,
  ): Promise<void> {
    const start = Date.now();
    const runLog = withIds(logger, { runId: run.id, agentId: agent.id });
    try {
      let llm;
      try {
        llm = await this.container.llm(agent.provider as Provider);
      } catch (err) {
        const reason = cut((err as Error).message);
        runLog?.error({ event: 'eval_run_failed', reason }, 'eval run failed: provider unavailable');
        await this.repo.failRun(run.id, reason);
        return;
      }

      const results: EvalCaseResult[] = [];
      for (const c of cases) {
        results.push(await this.evaluateCase(c, agent, skills, llm, withIds(logger, { runId: run.id, agentId: agent.id, caseId: c.id })));
      }

      const score = scoreRun(results);
      const stored = await this.repo.finishRun(run.id, {
        results,
        recall: score.recall,
        precision: score.precision,
        citationAccuracy: score.citation_accuracy,
        passed: score.passed,
        total: score.total,
        hasErrors: score.has_errors,
        costUsd: runCost(results),
        durationMs: Date.now() - start,
      });
      // False = the agent (and with it this run) was deleted meanwhile (EC-16).
      runLog?.info(
        { event: 'eval_run_finished', stored, passed: score.passed, total: score.total, hasErrors: score.has_errors },
        'eval run finished',
      );
    } catch (err) {
      const reason = cut((err as Error).message);
      runLog?.error({ event: 'eval_run_failed', reason }, 'eval run failed');
      await this.repo.failRun(run.id, reason).catch(() => undefined);
    }
  }

  private async evaluateCase(
    c: EvalCaseDbRow,
    agent: AgentRow,
    skills: SkillPart[],
    llm: Awaited<ReturnType<Container['llm']>>,
    log: EvalLogger | undefined,
  ): Promise<EvalCaseResult> {
    const exp = EvalExpectation.safeParse(c.expectedOutput);
    const base = {
      case_id: c.id,
      name: c.name,
      type: exp.success ? exp.data.type : ('must_find' as const),
      file: exp.success ? exp.data.file : '',
      start_line: exp.success ? exp.data.start_line : 0,
      end_line: exp.success ? exp.data.end_line : 0,
    };
    const failed = (reason: string): EvalCaseResult => ({
      ...base,
      status: 'error',
      kept: 0,
      dropped: 0,
      kept_findings: [],
      cost_usd: null,
      error: cut(reason),
    });

    try {
      const meta = EvalFrozenMeta.safeParse(c.inputMeta);
      if (!exp.success || !meta.success || !c.inputDiff) throw new IncompleteCaseError('The stored case is incomplete');

      const verbose = this.container.config?.promptLogVerbose === true;
      const ids = {
        call: 'review' as const,
        correlationId: c.id,
        prId: meta.data.pr_id,
        provider: agent.provider,
        model: agent.model,
      };
      const outcome = await withTimeout(reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        strategy: agent.strategy ?? 'single-pass',
        diff: parseUnifiedDiff(c.inputDiff),
        llm,
        // Omitted when empty so the prompt stays identical to a run without them.
        ...(skills.length > 0 ? { skills } : {}),
        prTitle: meta.data.pr_title,
        ...(meta.data.pr_description ? { prDescription: meta.data.pr_description } : {}),
        task: taskInstruction(meta.data.pr_number, null),
        ...(verbose ? { includePreviews: true } : {}),
        countTokens: (text: string) => this.container.tokenizer.count(text),
        onPromptAssembled: ({ sections }) =>
          logPromptAssembly(log, {
            ...ids,
            sections,
            totalTokens: sections.reduce((n, s) => n + s.tokens, 0),
            ...(verbose
              ? { verbose: true, previews: sections.map((s) => ({ name: s.name, text: s.preview ?? '' })) }
              : {}),
          }),
        onLlmCall: (e) =>
          logLlmCall(log, {
            ...ids,
            tokensIn: e.tokensIn,
            tokensOut: e.tokensOut,
            costUsd: e.costUsd,
            durationMs: e.durationMs,
            label: e.label,
          }),
      }), this.caseTimeoutMs);

      const kept = outcome.review.findings.map((f) => ({
        file: f.file,
        start_line: f.start_line,
        end_line: f.end_line,
        title: f.title,
      }));
      const status = caseStatus(exp.data.type, countMatches(kept, exp.data));
      log?.info(
        { event: 'eval_case', status, kept: kept.length, dropped: outcome.dropped.length, costUsd: outcome.costUsd },
        'eval case evaluated',
      );
      return {
        ...base,
        status,
        kept: kept.length,
        dropped: outcome.dropped.length,
        kept_findings: kept,
        cost_usd: outcome.costUsd,
        error: null,
      };
    } catch (err) {
      const reason = caseErrorReason(err);
      log?.warn({ event: 'eval_case', status: 'error', reason: cut(reason) }, 'eval case errored');
      return failed(reason);
    }
  }
}
