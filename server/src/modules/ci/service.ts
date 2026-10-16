import type {
  CiInstallResult,
  CiInstallation,
  CiPreview,
  CiBundleInput,
  CiInstallInput,
  CiRefreshResult,
  CiRunsResponse,
  GitHubClient,
  RepoRef,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, isWorkflowPermission } from '../../platform/errors.js';
import {
  checkArtifact,
  ciStatusFor,
  newestFirst,
  readResultArtifact,
  toCiRunRow,
} from './artifact.js';
import { buildBundle, prBody } from './bundle.js';
import {
  ARTIFACT_NAME,
  CI_BASE_BRANCH,
  CI_BRANCH,
  CI_COMMIT_MESSAGE,
  CI_PR_TITLE,
  ERR_MANIFEST_INVALID,
  ERR_REPO_TAKEN,
  ERR_RUNNER_MISSING,
  ERR_WORKFLOW_PERMISSION,
  RUNNER_BUILD_HINT,
  RUNS_LIMIT,
  WORKFLOW_FILE,
  WORKFLOW_PATH,
} from './constants.js';
import { enabledSkills, validateManifestText } from './manifest.js';
import { CiRepository, type CiInstallationDbRow, type GhaInstallationRow } from './repository.js';
import { readRunnerBuild } from './runner-build.js';
import { buildWorkflow } from './workflow.js';

export interface CiLogger {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
}

export interface CiServiceDeps {
  repo?: CiRepository;
  /** Directory of the built runner; defaults to `config.ciRunnerDir`. */
  runnerDir?: string;
}

const MAX_ERROR_CHARS = 300;

const toRef = (fullName: string): RepoRef => {
  const [owner = '', name = ''] = fullName.split('/');
  return { owner, name };
};

const toInstallation = (r: CiInstallationDbRow): CiInstallation => ({
  id: r.id,
  agent_id: r.agentId,
  repo: r.repo,
  target_type: r.targetType,
  installed_at: r.installedAt.toISOString(),
});

/**
 * Export to CI use-cases: build the bundle, install it through a pull request,
 * ingest GitHub Actions results on demand, list CI runs. Every method is
 * workspace-scoped; an id outside the caller's workspace is a 404.
 */
export class CiService {
  private repo: CiRepository;
  private runnerDir: string;

  constructor(
    private container: Container,
    deps: CiServiceDeps = {},
  ) {
    this.repo = deps.repo ?? new CiRepository(container.db);
    this.runnerDir = deps.runnerDir ?? container.config.ciRunnerDir;
  }

  async installations(workspaceId: string, agentId: string): Promise<CiInstallation[]> {
    await this.agent(workspaceId, agentId);
    return (await this.repo.installationsForAgent(workspaceId, agentId)).map(toInstallation);
  }

  async preview(workspaceId: string, agentId: string, input: CiBundleInput): Promise<CiPreview> {
    const { files } = await this.bundle(workspaceId, agentId, input);
    return { files };
  }

  async install(workspaceId: string, agentId: string, input: CiInstallInput): Promise<CiInstallResult> {
    const agent = await this.agent(workspaceId, agentId);
    const repoRow = await this.repoOf(workspaceId, input.repo_id);

    const holder = await this.repo.installationForRepo(workspaceId, repoRow.fullName);
    if (holder && holder.agentId !== agentId) {
      throw new AppError(
        ERR_REPO_TAKEN,
        `Another agent is already installed in ${repoRow.fullName}. A repository holds one DevDigest agent.`,
        409,
      );
    }

    const { files } = await this.bundle(workspaceId, agentId, input, agent);
    // A-5: only the workflow may come from the client; it is committed unchanged.
    const toCommit = input.workflow
      ? files.map((f) => (f.path === WORKFLOW_PATH ? { ...f, contents: input.workflow! } : f))
      : files;
    const paths = toCommit.map((f) => f.path);

    const gh = await this.container.github();
    const ref: RepoRef = { owner: repoRow.owner, name: repoRow.name };
    try {
      await gh.commitFiles(ref, {
        branch: CI_BRANCH,
        base: CI_BASE_BRANCH,
        message: CI_COMMIT_MESSAGE,
        files: toCommit.map((f) => ({ path: f.path, contents: f.contents })),
      });
    } catch (err) {
      if (isWorkflowPermission(err)) {
        throw new AppError(
          ERR_WORKFLOW_PERMISSION,
          'GitHub refused to write the workflow file. The token needs the "workflow" scope (classic token) ' +
            'or Workflows: write (fine-grained token).',
          403,
        );
      }
      throw err;
    }

    const existing = await gh.findOpenPr(ref, CI_BRANCH);
    const pr =
      existing ??
      (await gh.openPullRequest(ref, {
        title: CI_PR_TITLE,
        head: CI_BRANCH,
        base: CI_BASE_BRANCH,
        body: prBody(paths),
      }));

    const saved = await this.repo.upsertInstallation(workspaceId, agentId, repoRow.fullName);
    if (saved.kind === 'taken') {
      throw new AppError(ERR_REPO_TAKEN, `Another agent is already installed in ${repoRow.fullName}.`, 409);
    }
    return {
      installation: toInstallation(saved.row),
      pr_url: pr.url,
      reused_pr: existing !== null,
      paths,
    };
  }

  async listRuns(workspaceId: string, agentId?: string): Promise<CiRunsResponse> {
    const rows = await this.repo.listRuns(workspaceId, agentId);
    return { runs: newestFirst(rows.map(toCiRunRow)) };
  }

  /** Pull new results from GitHub for every installation; never deletes anything (AC-11). */
  async refresh(workspaceId: string, log: CiLogger): Promise<CiRefreshResult> {
    const installs = await this.repo.ghaInstallations(workspaceId);
    let ingested = 0;
    let skipped = 0;
    const errors: string[] = [];

    if (installs.length > 0) {
      const gh = await this.container.github();
      for (const inst of installs) {
        try {
          const r = await this.ingestInstallation(workspaceId, gh, inst, log);
          ingested += r.ingested;
          skipped += r.skipped;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`GitHub error for ${inst.repo}: ${msg}`.slice(0, MAX_ERROR_CHARS));
        }
      }
    }

    const { runs } = await this.listRuns(workspaceId);
    return { runs, error: errors.length > 0 ? errors.join('; ') : null, ingested, skipped };
  }

  // ---------------------------------------------------------------- internals

  private async ingestInstallation(
    workspaceId: string,
    gh: GitHubClient,
    inst: GhaInstallationRow,
    log: CiLogger,
  ): Promise<{ ingested: number; skipped: number }> {
    const ref = toRef(inst.repo);
    const runs = await gh.listWorkflowRuns(ref, WORKFLOW_FILE, RUNS_LIMIT);
    const known = await this.repo.ingestedUrls(
      workspaceId,
      runs.map((r) => r.html_url),
    );
    let ingested = 0;
    let skipped = 0;
    for (const run of runs) {
      if (known.has(run.html_url)) continue;
      const skip = async (reason: string) => {
        skipped++;
        log.warn({ runUrl: run.html_url, reason }, 'ci ingest: run skipped');
      };

      // AC-9 / D15: on pull_request GitHub runs the PR's own workflow file, so only
      // same-repo runs are trusted; a fork PR could upload a forged artifact.
      if (run.head_repo?.toLowerCase() !== inst.repo.toLowerCase()) {
        await skip('foreign_head_repo');
        continue;
      }

      const dl = await gh.downloadArtifact(ref, run.id, ARTIFACT_NAME);
      if (dl.kind !== 'ok') {
        await skip(dl.kind);
        continue;
      }
      const read = readResultArtifact(dl.zip);
      if (!read.ok) {
        await skip(read.reason);
        continue;
      }
      const mismatch = checkArtifact(read.data, run, inst.agentName);
      if (mismatch) {
        await skip(mismatch);
        continue;
      }
      try {
        const prNumber = run.pr_number as number; // checkArtifact guarantees non-null
        const prId = await this.repo.prIdFor(workspaceId, inst.repo, prNumber);
        const recorded = await this.repo.recordCiRun(workspaceId, {
          githubUrl: run.html_url,
          agentId: inst.agentId,
          installationId: inst.installationId,
          provider: inst.provider,
          model: inst.model,
          prId,
          prNumber,
          status: ciStatusFor(run.conclusion, read.data.findings_count),
          findingsCount: read.data.findings_count,
          costUsd: read.data.cost_usd,
          durationMs: read.data.duration_ms ?? null,
          ranAt: new Date(run.completed_at),
        });
        if (recorded) ingested++;
      } catch {
        // One run's DB failure must not abort the installation; the message is not logged.
        await skip('record_failed');
      }
    }
    return { ingested, skipped };
  }

  private async agent(workspaceId: string, agentId: string) {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async repoOf(workspaceId: string, repoId: string) {
    const row = await this.repo.repoById(workspaceId, repoId);
    if (!row) throw new NotFoundError('Repository not found');
    return row;
  }

  /** Same bundle for Preview and Install (A-3); validates the manifest like the runner reads it. */
  private async bundle(
    workspaceId: string,
    agentId: string,
    input: CiBundleInput,
    known?: Awaited<ReturnType<CiService['agent']>>,
  ) {
    const agent = known ?? (await this.agent(workspaceId, agentId));
    await this.repoOf(workspaceId, input.repo_id);

    const runner = await readRunnerBuild(this.runnerDir);
    if (!runner) {
      throw new AppError(
        ERR_RUNNER_MISSING,
        `The CI runner is not built. Run \`${RUNNER_BUILD_HINT}\` and try again.`,
        409,
      );
    }
    const skills = enabledSkills(await this.container.agentsRepo.linkedSkills(agentId));
    const files = buildBundle({
      agent,
      skills,
      runner,
      workflow: buildWorkflow(input.triggers, input.post_as),
    });
    if (!validateManifestText(files[0]!.contents)) {
      throw new AppError(
        ERR_MANIFEST_INVALID,
        'The agent cannot be exported: its manifest is invalid (check that the name, model and prompt are set).',
        422,
      );
    }
    return { files };
  }
}
