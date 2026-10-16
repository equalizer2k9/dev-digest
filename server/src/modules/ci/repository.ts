import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiRunDbRow } from './artifact.js';

/**
 * CI data-access: the ONLY layer touching `ci_installations` and `ci_runs`
 * (plus the `agent_runs` row each CI run shares its id with, D-1). Every read
 * and write is workspace-scoped through `agents` / `agent_runs`.
 */

export type CiInstallationDbRow = typeof t.ciInstallations.$inferSelect;

export interface CiRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

/** An installation joined to its agent, as refresh needs it. */
export interface GhaInstallationRow {
  installationId: string;
  agentId: string;
  agentName: string;
  provider: string;
  model: string;
  repo: string;
}

export interface CiRunValues {
  /** Run URL — the dedupe key (D-2). */
  githubUrl: string;
  agentId: string;
  installationId: string;
  provider: string;
  model: string;
  prId: string | null;
  prNumber: number;
  status: string;
  findingsCount: number;
  costUsd: number | null;
  durationMs: number | null;
  ranAt: Date;
}

export type UpsertInstallationResult =
  | { kind: 'ok'; row: CiInstallationDbRow }
  | { kind: 'taken' };

export class CiRepository {
  constructor(private db: Db) {}

  async repoById(workspaceId: string, repoId: string): Promise<CiRepoRow | undefined> {
    const [row] = await this.db
      .select({ id: t.repos.id, owner: t.repos.owner, name: t.repos.name, fullName: t.repos.fullName })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  async installationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationDbRow[]> {
    const rows = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciInstallations.installedAt));
    return rows.map((r) => r.inst);
  }

  /** The gha installation of `fullName` in this workspace, if any (A-6: at most one). */
  async installationForRepo(
    workspaceId: string,
    fullName: string,
  ): Promise<CiInstallationDbRow | undefined> {
    const [row] = await this.db
      .select({ inst: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.ciInstallations.repo, fullName),
          eq(t.ciInstallations.targetType, 'gha'),
        ),
      );
    return row?.inst;
  }

  async ghaInstallations(workspaceId: string): Promise<GhaInstallationRow[]> {
    return this.db
      .select({
        installationId: t.ciInstallations.id,
        agentId: t.agents.id,
        agentName: t.agents.name,
        provider: t.agents.provider,
        model: t.agents.model,
        repo: t.ciInstallations.repo,
      })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.targetType, 'gha')))
      .orderBy(t.ciInstallations.repo);
  }

  /**
   * Insert or refresh the (agent, repo) installation. One transaction under an
   * advisory lock per (workspace, repo); re-checks that no OTHER agent holds the
   * repo (EC-12) so two concurrent installs cannot both win.
   */
  upsertInstallation(
    workspaceId: string,
    agentId: string,
    fullName: string,
  ): Promise<UpsertInstallationResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${workspaceId} || ':' || ${fullName}))`,
      );
      const existing = await tx
        .select({ inst: t.ciInstallations })
        .from(t.ciInstallations)
        .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
        .where(
          and(
            eq(t.agents.workspaceId, workspaceId),
            eq(t.ciInstallations.repo, fullName),
            eq(t.ciInstallations.targetType, 'gha'),
          ),
        );
      if (existing.some((e) => e.inst.agentId !== agentId)) return { kind: 'taken' } as const;

      const mine = existing[0]?.inst;
      if (mine) {
        const [updated] = await tx
          .update(t.ciInstallations)
          .set({ installedAt: sql`now()` })
          .where(eq(t.ciInstallations.id, mine.id))
          .returning();
        return { kind: 'ok', row: updated! } as const;
      }
      const [inserted] = await tx
        .insert(t.ciInstallations)
        .values({ agentId, repo: fullName, targetType: 'gha' })
        .returning();
      return { kind: 'ok', row: inserted! } as const;
    });
  }

  /** The subset of `urls` already recorded as CI runs of this workspace. */
  async ingestedUrls(workspaceId: string, urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set();
    const rows = await this.db
      .select({ url: t.ciRuns.githubUrl })
      .from(t.ciRuns)
      .innerJoin(t.agentRuns, eq(t.ciRuns.id, t.agentRuns.id))
      .where(and(eq(t.agentRuns.workspaceId, workspaceId), inArray(t.ciRuns.githubUrl, urls)));
    return new Set(rows.map((r) => r.url).filter((u): u is string => u !== null));
  }

  /** Id of an imported PR, or null (EC-9: the PR need not be imported). */
  async prIdFor(workspaceId: string, fullName: string, number: number): Promise<string | null> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.pullRequests.repoId, t.repos.id))
      .where(
        and(
          eq(t.pullRequests.workspaceId, workspaceId),
          eq(t.repos.fullName, fullName),
          eq(t.pullRequests.number, number),
        ),
      );
    return row?.id ?? null;
  }

  /**
   * Record one CI run: an `agent_runs` row (source 'ci') and a `ci_runs` row that
   * share one id (D-1), in one transaction under an advisory lock on
   * (workspace, run URL) with an existence check (D-2). false = already present.
   */
  recordCiRun(workspaceId: string, v: CiRunValues): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${workspaceId} || ':' || ${v.githubUrl}))`,
      );
      const [dup] = await tx
        .select({ id: t.ciRuns.id })
        .from(t.ciRuns)
        .innerJoin(t.agentRuns, eq(t.ciRuns.id, t.agentRuns.id))
        .where(and(eq(t.agentRuns.workspaceId, workspaceId), eq(t.ciRuns.githubUrl, v.githubUrl)));
      if (dup) return false;

      const [run] = await tx
        .insert(t.agentRuns)
        .values({
          workspaceId,
          agentId: v.agentId,
          prId: v.prId,
          ranAt: v.ranAt,
          provider: v.provider,
          model: v.model,
          durationMs: v.durationMs,
          tokensIn: null,
          tokensOut: null,
          costUsd: v.costUsd,
          status: 'done',
          source: 'ci',
          findingsCount: v.findingsCount,
        })
        .returning({ id: t.agentRuns.id });
      await tx.insert(t.ciRuns).values({
        id: run!.id,
        ciInstallationId: v.installationId,
        prNumber: v.prNumber,
        ranAt: v.ranAt,
        status: v.status,
        findingsCount: v.findingsCount,
        costUsd: v.costUsd,
        githubUrl: v.githubUrl,
        source: 'gha',
      });
      return true;
    });
  }

  /** CI runs of the workspace (optionally one agent), newest first. */
  async listRuns(workspaceId: string, agentId?: string): Promise<CiRunDbRow[]> {
    const rows = await this.db
      .select({
        id: t.ciRuns.id,
        installationRepo: t.ciInstallations.repo,
        prNumber: t.ciRuns.prNumber,
        agentId: t.agentRuns.agentId,
        agentName: t.agents.name,
        status: t.ciRuns.status,
        findingsCount: t.ciRuns.findingsCount,
        costUsd: t.ciRuns.costUsd,
        durationMs: t.agentRuns.durationMs,
        ranAt: t.ciRuns.ranAt,
        githubUrl: t.ciRuns.githubUrl,
      })
      .from(t.ciRuns)
      .innerJoin(t.agentRuns, eq(t.ciRuns.id, t.agentRuns.id))
      .leftJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .leftJoin(t.agents, eq(t.agentRuns.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          agentId ? eq(t.agentRuns.agentId, agentId) : undefined,
        ),
      )
      .orderBy(desc(t.ciRuns.ranAt));
    return rows;
  }
}
