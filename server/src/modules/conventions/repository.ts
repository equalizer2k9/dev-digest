import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ConventionCategory, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { PENDING_STATUS, VISIBLE_STATUSES } from './constants.js';

/**
 * Conventions data-access. The ONLY place in this module touching Drizzle: it
 * owns `conventions` + `convention_scans` and reads `repos` for the owner/name
 * the git adapter needs. Every query is workspace-scoped, so a repo or candidate
 * from another workspace is simply not found — never a 403.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type ConventionScanRow = typeof t.conventionScans.$inferSelect;

/**
 * A candidate plus the head sha of the scan that produced it. The sha lives on
 * `convention_scans`, so it is ALWAYS a `leftJoin`: `scan_id` is nullable (the
 * FK is `set null`) and an inner join would silently hide older candidates.
 */
export interface ConventionRowWithSha {
  row: ConventionRow;
  headSha: string | null;
}

/** The repo fields this module needs; `repos` itself is owned by the repos module. */
export interface ConventionRepoRow {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export interface InsertConventionScan {
  workspaceId: string;
  repoId: string;
  headSha: string | null;
  model: string;
  sampleFiles: number;
  dropped: number;
  warnings: string[];
}

export interface InsertConvention {
  category: ConventionCategory;
  rule: string;
  ruleKey: string;
  evidencePath: string;
  evidenceStartLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
}

/** Everything `PUT /conventions/:id` may change. */
export interface UpdateConvention {
  status?: ConventionStatus;
  accepted?: boolean;
  rule?: string;
  ruleKey?: string;
  category?: ConventionCategory;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** Workspace-scoped repo basics; undefined for a foreign or missing repo. */
  async getRepo(workspaceId: string, repoId: string): Promise<ConventionRepoRow | undefined> {
    const [row] = await this.db
      .select({
        id: t.repos.id,
        owner: t.repos.owner,
        name: t.repos.name,
        fullName: t.repos.fullName,
        defaultBranch: t.repos.defaultBranch,
      })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  // ---- convention_scans ---------------------------------------------------

  /** The newest scan of a repo — what `extracted_at` / `model` report. */
  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  /**
   * One scan, atomically (spec §5): record the scan row, drop the repo's
   * `pending` rows and write this scan's survivors pointing at it. `accepted` and
   * `rejected` rows are untouched — the tombstones the merge depends on.
   */
  async recordScan(
    scan: InsertConventionScan,
    candidates: InsertConvention[],
  ): Promise<ConventionScanRow> {
    return this.db.transaction(async (tx) => {
      const [scanRow] = await tx
        .insert(t.conventionScans)
        .values({
          workspaceId: scan.workspaceId,
          repoId: scan.repoId,
          headSha: scan.headSha,
          model: scan.model,
          sampleFiles: scan.sampleFiles,
          dropped: scan.dropped,
          warnings: scan.warnings,
        })
        .returning();

      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, scan.workspaceId),
            eq(t.conventions.repoId, scan.repoId),
            eq(t.conventions.status, PENDING_STATUS),
          ),
        );

      if (candidates.length > 0) {
        await tx.insert(t.conventions).values(
          candidates.map((c) => ({
            workspaceId: scan.workspaceId,
            repoId: scan.repoId,
            scanId: scanRow!.id,
            category: c.category,
            rule: c.rule,
            ruleKey: c.ruleKey,
            evidencePath: c.evidencePath,
            evidenceStartLine: c.evidenceStartLine,
            evidenceEndLine: c.evidenceEndLine,
            evidenceSnippet: c.evidenceSnippet,
            confidence: c.confidence,
            status: PENDING_STATUS,
            accepted: false,
          })),
        );
      }

      return scanRow!;
    });
  }

  // ---- conventions --------------------------------------------------------

  /** Every candidate of a repo INCLUDING `rejected` — the rescan merge input. */
  async listAll(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  /** `pending` + `accepted`, confidence descending; `rejected` never ships. */
  async listVisible(workspaceId: string, repoId: string): Promise<ConventionRowWithSha[]> {
    return this.joined(
      and(
        eq(t.conventions.workspaceId, workspaceId),
        eq(t.conventions.repoId, repoId),
        inArray(t.conventions.status, [...VISIBLE_STATUSES]),
      ),
    );
  }

  /** Candidates in one status — `accepted` feeds the draft and the skill (§6). */
  async listByStatus(
    workspaceId: string,
    repoId: string,
    status: ConventionStatus,
  ): Promise<ConventionRowWithSha[]> {
    return this.joined(
      and(
        eq(t.conventions.workspaceId, workspaceId),
        eq(t.conventions.repoId, repoId),
        eq(t.conventions.status, status),
      ),
    );
  }

  async getCandidate(workspaceId: string, id: string): Promise<ConventionRowWithSha | undefined> {
    const [row] = await this.joined(
      and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)),
    );
    return row;
  }

  async updateCandidate(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /** The candidate + scan join every read goes through, confidence descending. */
  private async joined(where: ReturnType<typeof and>): Promise<ConventionRowWithSha[]> {
    const rows = await this.db
      .select({ row: t.conventions, headSha: t.conventionScans.headSha })
      .from(t.conventions)
      .leftJoin(t.conventionScans, eq(t.conventions.scanId, t.conventionScans.id))
      .where(where)
      .orderBy(desc(t.conventions.confidence));
    return rows.map((r) => ({ row: r.row, headSha: r.headSha }));
  }
}
