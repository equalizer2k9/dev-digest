import type { FastifyBaseLogger } from 'fastify';
import type { BlastRadiusResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { refreshPullDetailFromGitHub } from '../_shared/pull-detail.js';
import { toBlastRadius, toContractReason } from './helpers.js';

/**
 * Blast radius for a PR: its changed files → ONE `repoIntel.getBlastRadius`
 * call → `toBlastRadius`. No LLM, no embedder, no limits of its own (the caller
 * cap lives in the repo-intel facade).
 */
export class BlastService {
  constructor(
    private container: Container,
    private log: FastifyBaseLogger,
  ) {}

  async forPull(workspaceId: string, prId: string): Promise<BlastRadiusResponse> {
    const started = Date.now();
    const { reviewRepo, repoIntel } = this.container;

    const pull = await reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    let files = await reviewRepo.getPrFiles(prId);
    if (files.length === 0) {
      // Same refresh GET /pulls/:id runs; only when nothing is stored yet.
      try {
        const repo = await reviewRepo.getRepo(pull.repoId);
        if (repo) {
          await refreshPullDetailFromGitHub(this.container, pull, repo);
          files = await reviewRepo.getPrFiles(prId);
        }
      } catch (err) {
        this.log.warn({ err, prId }, 'blast: PR files refresh skipped (no token / offline)');
      }
    }

    // No files still goes to the facade: it owns the degraded reason
    // (`flag_off` beats `no_data`), so the service never invents one.
    const result = await repoIntel.getBlastRadius(
      pull.repoId,
      files.map((f) => f.path),
    );
    const radius = toBlastRadius(result);
    const body: BlastRadiusResponse = {
      ...radius,
      degraded: result.degraded ?? false,
      reason: result.degraded ? toContractReason(result.reason) : null,
    };
    this.logServed(
      prId,
      pull.repoId,
      body,
      radius.changed_symbols.length,
      radius.downstream.reduce((n, d) => n + d.callers.length, 0),
      started,
    );
    return body;
  }

  private logServed(
    prId: string,
    repoId: string,
    body: BlastRadiusResponse,
    symbols: number,
    callers: number,
    started: number,
  ): void {
    this.log.info(
      { prId, repoId, degraded: body.degraded, reason: body.reason, symbols, callers, ms: Date.now() - started },
      'blast: served',
    );
  }
}
