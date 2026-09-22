import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillDraft,
  ConventionStatus,
  Skill,
  SkillType,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { SkillsService } from '../skills/service.js';
import {
  ACCEPTED_STATUS,
  CONVENTIONS_FEATURE,
  CONVENTIONS_SCHEMA_NAME,
  CONVENTIONS_SYSTEM_PROMPT,
  DEFAULT_SKILL_TYPE,
  EXTRACTED_SOURCE,
  MAX_CANDIDATES,
  MODEL_MAX_TOKENS,
  MODEL_TEMPERATURE,
  NO_ACCEPTED_CODE,
  NO_ACCEPTED_MESSAGE,
  PENDING_STATUS,
  REPO_NOT_INDEXED_CODE,
  REPO_NOT_INDEXED_MESSAGE,
} from './constants.js';
import {
  acceptedEvidenceFiles,
  buildSkillDraft,
  buildUserMessage,
  LlmConventionResult,
  normalizeRule,
  selectSamples,
  toCandidateDto,
  verifyEvidence,
  type ConventionSample,
  type LlmConventionCandidate,
} from './helpers.js';
import {
  ConventionsRepository,
  type ConventionRepoRow,
  type InsertConvention,
} from './repository.js';

/**
 * Conventions business logic (spec §2–§6).
 *
 * The division of labour is the point of this module: the MODEL only proposes
 * `{category, rule, evidence, confidence}`; sample selection, evidence
 * verification, the rescan merge and the skill body are all code here. The
 * provider/model is whatever Settings → Models says for `conventions` — this
 * file names neither (AC-53).
 */

/** Minimal pino-compatible sink; a Fastify `req.log` satisfies it. */
export type ScanLogger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

export interface UpdateCandidateInput {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface CreateConventionSkillInput {
  name: string;
  description?: string;
  type?: SkillType;
  enabled?: boolean;
  body: string;
  agentId?: string;
}

export class ConventionsService {
  private repo: ConventionsRepository;
  private skills: SkillsService;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
    this.skills = new SkillsService(container);
  }

  /** The stored scan: visible candidates + what the latest scan itself did. */
  async get(workspaceId: string, repoId: string): Promise<ConventionScan> {
    await this.requireRepo(workspaceId, repoId);
    const [scan, rows] = await Promise.all([
      this.repo.latestScan(workspaceId, repoId),
      this.repo.listVisible(workspaceId, repoId),
    ]);
    return {
      repo_id: repoId,
      candidates: rows.map(toCandidateDto),
      extracted_at: scan?.createdAt?.toISOString() ?? null,
      sample_files: scan?.sampleFiles ?? 0,
      dropped: scan?.dropped ?? 0,
      model: scan?.model ?? null,
      warnings: scan?.warnings ?? [],
    };
  }

  /**
   * One scan: samples (code) → one structured model call → code-side evidence
   * verification → merge against what the user already judged → persist. The
   * result is read back from the DB, so what this returns is exactly what a
   * later `GET` returns (AC-38).
   */
  async extract(
    workspaceId: string,
    repoId: string,
    logger?: ScanLogger,
  ): Promise<ConventionScan> {
    const repo = await this.requireRepo(workspaceId, repoId);

    // §2 — sample selection. No LLM is resolved before this point.
    const { samples, warnings } = await selectSamples(this.container, repo);
    if (samples.length === 0) {
      throw new AppError(REPO_NOT_INDEXED_CODE, REPO_NOT_INDEXED_MESSAGE, 409);
    }

    // §3 — the model comes from Settings → Models, never from this module.
    const { provider, model } = await resolveFeatureModel(
      this.container,
      workspaceId,
      CONVENTIONS_FEATURE,
    );
    const proposed = await this.propose(workspaceId, repo, samples, model, provider);

    // §4 — evidence is verified in code; the snippet is re-read from the file.
    const { survivors, dropped } = this.verify(proposed, samples, logger);

    // §5 — merge against the rows the user already judged, then persist.
    const existing = await this.repo.listAll(workspaceId, repoId);
    const blocked = new Set(
      existing
        .filter((r) => r.status !== PENDING_STATUS && r.ruleKey)
        .map((r) => r.ruleKey as string),
    );
    const fresh: InsertConvention[] = [];
    const taken = new Set<string>();
    for (const candidate of survivors) {
      const ruleKey = normalizeRule(candidate.rule);
      if (blocked.has(ruleKey) || taken.has(ruleKey)) continue;
      taken.add(ruleKey);
      fresh.push({ ...candidate, ruleKey });
    }

    await this.repo.recordScan(
      {
        workspaceId,
        repoId,
        headSha: await this.headSha(repo),
        model,
        sampleFiles: samples.length,
        dropped,
        warnings,
      },
      fresh,
    );

    return this.get(workspaceId, repoId);
  }

  /**
   * Accept / reject / edit one candidate. `accepted` is written in lockstep with
   * `status`, and an edited rule gets a fresh merge key while keeping its
   * evidence — the range was verified against the file, not against the wording.
   */
  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: UpdateCandidateInput,
  ): Promise<ConventionCandidate> {
    const existing = await this.repo.getCandidate(workspaceId, id);
    if (!existing) throw new NotFoundError('Convention candidate not found');

    const row = await this.repo.updateCandidate(workspaceId, id, {
      ...(patch.status !== undefined
        ? { status: patch.status, accepted: patch.status === ACCEPTED_STATUS }
        : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule, ruleKey: normalizeRule(patch.rule) } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
    });
    if (!row) throw new NotFoundError('Convention candidate not found');
    return toCandidateDto({ row, headSha: existing.headSha });
  }

  /** The editable draft, built server-side from `accepted` rows only (§6). */
  async draft(workspaceId: string, repoId: string): Promise<ConventionSkillDraft> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const accepted = await this.repo.listByStatus(workspaceId, repoId, ACCEPTED_STATUS);
    if (accepted.length === 0) throw new AppError(NO_ACCEPTED_CODE, NO_ACCEPTED_MESSAGE, 409);
    return buildSkillDraft(repo.name, accepted);
  }

  /**
   * Persist the (possibly edited) draft as a `source = 'extracted'` skill.
   *
   * A skill with the same name and source already in the workspace is UPDATED
   * instead of inserted, so re-running the flow bumps the version and keeps the
   * agent links rather than forking `repo-conventions-2`. `agent_id` links it to
   * that agent at the end of its list in the same request.
   */
  async createSkill(
    workspaceId: string,
    repoId: string,
    input: CreateConventionSkillInput,
  ): Promise<Skill> {
    await this.requireRepo(workspaceId, repoId);

    // Resolved BEFORE the write so an unknown agent creates nothing (§6).
    const agent = input.agentId
      ? await this.container.agentsRepo.getById(workspaceId, input.agentId)
      : undefined;
    if (input.agentId && !agent) throw new NotFoundError('Agent not found');

    const accepted = await this.repo.listByStatus(workspaceId, repoId, ACCEPTED_STATUS);
    const evidenceFiles = acceptedEvidenceFiles(accepted);
    const existing = await this.skills.findByNameAndSource(workspaceId, input.name, EXTRACTED_SOURCE);

    const skill = existing
      ? await this.skills.update(workspaceId, existing.id, {
          ...(input.description !== undefined ? { description: input.description } : {}),
          type: input.type ?? DEFAULT_SKILL_TYPE,
          ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
          body: input.body,
        })
      : await this.skills.create(
          workspaceId,
          {
            name: input.name,
            ...(input.description !== undefined ? { description: input.description } : {}),
            type: input.type ?? DEFAULT_SKILL_TYPE,
            body: input.body,
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(evidenceFiles.length > 0 ? { evidenceFiles } : {}),
          },
          EXTRACTED_SOURCE,
        );

    if (agent) {
      const links = await this.container.agentsRepo.linkedSkills(agent.id);
      const order = links.reduce((max, l) => Math.max(max, l.order + 1), 0);
      await this.container.agentsRepo.linkSkill(agent.id, skill.id, order);
    }
    return skill;
  }

  // ---- internals ----------------------------------------------------------

  /** A repo outside the caller's workspace is reported as not found, not 403. */
  private async requireRepo(workspaceId: string, repoId: string): Promise<ConventionRepoRow> {
    const repo = await this.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo;
  }

  /**
   * The ONE structured model call per scan. Any failure — a transport error or a
   * reply that does not fit `LlmConventionResult` — becomes a typed AppError, so
   * the client gets `502 external_service_error` with a message instead of a
   * stack trace (AC-40).
   */
  private async propose(
    workspaceId: string,
    repo: ConventionRepoRow,
    samples: ConventionSample[],
    model: string,
    provider: Parameters<Container['llm']>[0],
  ): Promise<LlmConventionCandidate[]> {
    const system = await renderPrompt(CONVENTIONS_SYSTEM_PROMPT, {
      max_candidates: String(MAX_CANDIDATES),
    });
    const llm = await this.container.llm(provider);
    try {
      const result = await llm.completeStructured({
        model,
        schema: LlmConventionResult,
        schemaName: CONVENTIONS_SCHEMA_NAME,
        temperature: MODEL_TEMPERATURE,
        maxTokens: MODEL_MAX_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: buildUserMessage(repo.fullName, samples) },
        ],
      });
      return result.data.candidates;
    } catch (err) {
      throw new ExternalServiceError(
        `The conventions model did not return a usable result: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { workspaceId, repoId: repo.id },
      );
    }
  }

  /**
   * Keep only the candidates whose evidence checks out. Dropped ones are counted
   * into `ConventionScan.dropped` and their reasons go to the server log — a
   * model that cites a file it was never shown leaves a trace.
   */
  private verify(
    proposed: LlmConventionCandidate[],
    samples: ConventionSample[],
    logger?: ScanLogger,
  ): { survivors: Omit<InsertConvention, 'ruleKey'>[]; dropped: number } {
    const survivors: Omit<InsertConvention, 'ruleKey'>[] = [];
    const reasons: string[] = [];
    for (const candidate of proposed) {
      const check = verifyEvidence(candidate, samples);
      if (!check.ok) {
        reasons.push(check.reason);
        continue;
      }
      survivors.push({
        category: candidate.category,
        rule: candidate.rule,
        evidencePath: check.evidence.path,
        evidenceStartLine: check.evidence.startLine,
        evidenceEndLine: check.evidence.endLine,
        evidenceSnippet: check.evidence.snippet,
        confidence: candidate.confidence,
      });
    }
    if (reasons.length > 0) {
      logger?.warn(
        { dropped: reasons.length, reasons },
        'conventions: evidence check dropped candidates',
      );
    }
    return { survivors, dropped: reasons.length };
  }

  /** Clone HEAD pins this scan's evidence links; unresolvable → null. */
  private async headSha(repo: ConventionRepoRow): Promise<string | null> {
    try {
      return await this.container.git.currentHead({ owner: repo.owner, name: repo.name });
    } catch {
      return null;
    }
  }
}
