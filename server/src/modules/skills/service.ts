import type {
  Skill,
  SkillImportPreview,
  SkillType,
  SkillVersion,
  SkillWithUsage,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { IMPORT_SOURCE, MANUAL_SOURCE } from './constants.js';
import {
  parseSkillUpload,
  toSkillDto,
  toSkillVersionDto,
  type ImportOverrides,
  type UploadedFile,
} from './helpers.js';
import { SkillsRepository } from './repository.js';

/**
 * Skills business logic (spec §1–§3).
 *
 * Versioning lives HERE, not in the repository: the service decides whether a
 * write is a body change (new version) or metadata only (no bump), and the
 * repository provides the two atomic primitives. A skill that is not in the
 * caller's workspace is reported as not found — never as forbidden.
 */

export interface CreateSkillInput {
  name: string;
  description?: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  /** Every skill in the workspace (not just the linked ones), name ascending. */
  async list(workspaceId: string): Promise<SkillWithUsage[]> {
    const rows = await this.repo.listWithUsage(workspaceId);
    return rows.map((r) => ({ ...toSkillDto(r.skill), agent_count: r.agentCount }));
  }

  async get(workspaceId: string, id: string): Promise<Skill> {
    return toSkillDto(await this.require(workspaceId, id));
  }

  /** Create at version 1 + its v1 snapshot, in one transaction. */
  async create(
    workspaceId: string,
    input: CreateSkillInput,
    source: Skill['source'] = MANUAL_SOURCE,
  ): Promise<Skill> {
    const row = await this.repo.insertWithVersion({
      workspaceId,
      name: input.name,
      description: input.description ?? '',
      type: input.type,
      source,
      body: input.body,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    return toSkillDto(row);
  }

  /**
   * Update a skill. The body decides the version:
   *  - body present AND different → version + 1 and a new `skill_versions` row;
   *  - body absent or byte-identical → metadata-only write, version untouched
   *    (so toggling `enabled` never creates a version).
   */
  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill> {
    const existing = await this.require(workspaceId, id);
    const meta = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    };

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    if (!bodyChanged) {
      const row = await this.repo.updateMetadata(workspaceId, id, meta);
      if (!row) throw new NotFoundError('Skill not found');
      return toSkillDto(row);
    }

    const row = await this.repo.updateWithNewVersion(
      workspaceId,
      id,
      meta,
      existing.version + 1,
      patch.body!,
    );
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  /** Delete the skill; its versions and agent links cascade. */
  async delete(workspaceId: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteById(workspaceId, id);
    if (!deleted) throw new NotFoundError('Skill not found');
  }

  /** Every snapshot for a skill, newest first. */
  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[]> {
    await this.require(workspaceId, id);
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  /** One snapshot's exact body, for diffing against the current one. */
  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion> {
    await this.require(workspaceId, id);
    const row = await this.repo.getVersion(id, version);
    if (!row) throw new NotFoundError('Skill version not found');
    return toSkillVersionDto(row);
  }

  /**
   * Restore an older body by APPENDING it as a new version (`current + 1`).
   * History is never rewritten or dropped, so the restore is itself undoable
   * and a past run still resolves the exact text it was scored on. Restoring
   * the version that is already current is a no-op.
   */
  async restore(workspaceId: string, id: string, version: number): Promise<Skill> {
    const existing = await this.require(workspaceId, id);
    if (version === existing.version) return toSkillDto(existing);

    const snapshot = await this.repo.getVersion(id, version);
    if (!snapshot) throw new NotFoundError('Skill version not found');

    const row = await this.repo.updateWithNewVersion(
      workspaceId,
      id,
      {},
      existing.version + 1,
      snapshot.body,
    );
    if (!row) throw new NotFoundError('Skill not found');
    return toSkillDto(row);
  }

  // ---- Import (spec §3) ---------------------------------------------------

  /**
   * Parse an upload and return the skill core. Touches NO table: the user
   * corrects these fields and posts them back to `import`.
   */
  preview(file: UploadedFile, overrides: ImportOverrides = {}): SkillImportPreview {
    return parseSkillUpload(file, overrides);
  }

  /**
   * Same parser, then persist with `source = 'imported_file'` (plus v1 in
   * `skill_versions`). The body is stored VERBATIM — it is data, not
   * instructions, and is delimiter-wrapped at prompt-assembly time.
   */
  async import(
    workspaceId: string,
    file: UploadedFile,
    overrides: ImportOverrides = {},
  ): Promise<Skill> {
    const parsed = parseSkillUpload(file, overrides);
    return this.create(
      workspaceId,
      {
        name: parsed.name,
        description: parsed.description,
        type: parsed.type,
        body: parsed.body,
      },
      IMPORT_SOURCE,
    );
  }

  /** Workspace-scoped fetch; a foreign or missing skill is a 404, never a 403. */
  private async require(workspaceId: string, id: string) {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) throw new NotFoundError('Skill not found');
    return row;
  }
}
