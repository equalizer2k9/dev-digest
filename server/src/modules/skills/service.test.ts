import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { Container } from '../../platform/container.js';
import { NotFoundError, type AppError } from '../../platform/errors.js';
import type { SkillRow, SkillVersionRow } from './repository.js';
import { SkillsService } from './service.js';

/**
 * Unit coverage for the skills service with a MOCKED repository (no Postgres —
 * the DB-backed behaviour lives in skills.it.test.ts). What is pinned here is
 * the versioning rule of spec §2: the body, and only the body, makes a version;
 * a restore APPENDS; and a workspace miss is a 404, never a 403.
 */

const repo = vi.hoisted(() => ({
  listWithUsage: vi.fn(),
  getById: vi.fn(),
  insertWithVersion: vi.fn(),
  updateMetadata: vi.fn(),
  updateWithNewVersion: vi.fn(),
  deleteById: vi.fn(),
  listVersions: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock('./repository.js', () => ({ SkillsRepository: vi.fn(() => repo) }));

const WS = 'ws-1';
const ID = 'skill-1';

function skillRow(over: Partial<SkillRow> = {}): SkillRow {
  return {
    id: ID,
    workspaceId: WS,
    name: 'test-quality-rubric',
    description: 'Flag happy-path-only tests.',
    type: 'rubric',
    source: 'manual',
    body: 'v1 body',
    enabled: true,
    version: 1,
    evidenceFiles: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function versionRow(over: Partial<SkillVersionRow> = {}): SkillVersionRow {
  return {
    skillId: ID,
    version: 1,
    body: 'v1 body',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

function service() {
  return new SkillsService({ db: {} } as unknown as Container);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SkillsService.create', () => {
  it('creates at version 1 with source manual and a v1 snapshot', async () => {
    repo.insertWithVersion.mockResolvedValue(skillRow());
    const skill = await service().create(WS, {
      name: 'test-quality-rubric',
      description: 'Flag happy-path-only tests.',
      type: 'rubric',
      body: 'v1 body',
    });

    // The v1 skill_versions row is the repository's transaction (insertWithVersion).
    expect(repo.insertWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WS, source: 'manual', body: 'v1 body' }),
    );
    expect(skill.version).toBe(1);
    expect(skill.source).toBe('manual');
  });
});

describe('SkillsService.update — version bump only on a body change', () => {
  it('bumps to version + 1 and writes a new snapshot when the body changes', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 3, body: 'old body' }));
    repo.updateWithNewVersion.mockResolvedValue(skillRow({ version: 4, body: 'new body' }));

    const skill = await service().update(WS, ID, { body: 'new body', name: 'renamed' });

    expect(repo.updateWithNewVersion).toHaveBeenCalledWith(
      WS,
      ID,
      { name: 'renamed' },
      4,
      'new body',
    );
    expect(repo.updateMetadata).not.toHaveBeenCalled();
    expect(skill.version).toBe(4);
  });

  it('does NOT bump when the incoming body is byte-identical', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 2, body: 'same body' }));
    repo.updateMetadata.mockResolvedValue(skillRow({ version: 2, body: 'same body' }));

    const skill = await service().update(WS, ID, { body: 'same body', description: 'new desc' });

    expect(repo.updateWithNewVersion).not.toHaveBeenCalled();
    expect(repo.updateMetadata).toHaveBeenCalledWith(WS, ID, { description: 'new desc' });
    expect(skill.version).toBe(2);
  });

  it('metadata-only update (an enabled toggle) keeps the version', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 7 }));
    repo.updateMetadata.mockResolvedValue(skillRow({ version: 7, enabled: false }));

    const skill = await service().update(WS, ID, { enabled: false });

    expect(repo.updateMetadata).toHaveBeenCalledWith(WS, ID, { enabled: false });
    expect(repo.updateWithNewVersion).not.toHaveBeenCalled();
    expect(skill.version).toBe(7);
    expect(skill.enabled).toBe(false);
  });
});

describe('SkillsService.restore — appends, never rewrites', () => {
  it('applies an old body as a NEW version (current + 1)', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 3, body: 'v3 body' }));
    repo.getVersion.mockResolvedValue(versionRow({ version: 1, body: 'v1 body' }));
    repo.updateWithNewVersion.mockResolvedValue(skillRow({ version: 4, body: 'v1 body' }));

    const skill = await service().restore(WS, ID, 1);

    expect(repo.getVersion).toHaveBeenCalledWith(ID, 1);
    // v4 is appended with v1's text — v1/v2/v3 are untouched.
    expect(repo.updateWithNewVersion).toHaveBeenCalledWith(WS, ID, {}, 4, 'v1 body');
    expect(repo.deleteById).not.toHaveBeenCalled();
    expect(skill.version).toBe(4);
    expect(skill.body).toBe('v1 body');
  });

  it('restoring the current version is a no-op returning the unchanged skill', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 3, body: 'v3 body' }));

    const skill = await service().restore(WS, ID, 3);

    expect(repo.updateWithNewVersion).not.toHaveBeenCalled();
    expect(repo.getVersion).not.toHaveBeenCalled();
    expect(skill.version).toBe(3);
    expect(skill.body).toBe('v3 body');
  });

  it('404s on a version that was never recorded', async () => {
    repo.getById.mockResolvedValue(skillRow({ version: 3 }));
    repo.getVersion.mockResolvedValue(undefined);

    await expect(service().restore(WS, ID, 9)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.updateWithNewVersion).not.toHaveBeenCalled();
  });
});

describe('SkillsService — workspace scoping', () => {
  it('a skill from another workspace is a 404, not a 403', async () => {
    repo.getById.mockResolvedValue(undefined);
    const svc = service();

    for (const call of [
      svc.get(WS, ID),
      svc.update(WS, ID, { body: 'x' }),
      svc.listVersions(WS, ID),
      svc.getVersion(WS, ID, 1),
      svc.restore(WS, ID, 1),
    ]) {
      const err = await call.catch((e: unknown) => e);
      expect(err).toBeInstanceOf(NotFoundError);
      expect((err as AppError).statusCode).toBe(404);
    }

    repo.deleteById.mockResolvedValue(false);
    await expect(svc.delete(WS, ID)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('SkillsService — list and import', () => {
  it('list carries agent_count through from the grouped query', async () => {
    repo.listWithUsage.mockResolvedValue([
      { skill: skillRow({ name: 'a' }), agentCount: 2 },
      { skill: skillRow({ id: 'skill-2', name: 'b' }), agentCount: 0 },
    ]);

    const skills = await service().list(WS);

    expect(skills.map((s) => [s.name, s.agent_count])).toEqual([
      ['a', 2],
      ['b', 0],
    ]);
  });

  it('preview parses without touching the repository', () => {
    const preview = service().preview({
      filename: 'my-skill.md',
      mimetype: 'text/markdown',
      bytes: strToU8('# Test Quality Rubric\n\nFlag happy-path-only tests.\n'),
    });

    expect(preview.name).toBe('test-quality-rubric');
    expect(preview.source).toBe('imported_file');
    expect(repo.insertWithVersion).not.toHaveBeenCalled();
    expect(repo.updateMetadata).not.toHaveBeenCalled();
    expect(repo.updateWithNewVersion).not.toHaveBeenCalled();
  });

  it('import persists the parsed core with source imported_file', async () => {
    repo.insertWithVersion.mockResolvedValue(skillRow({ source: 'imported_file' }));
    const bytes = zipSync({ 'pkg/SKILL.md': strToU8('# Zip Skill\n\nFrom an archive.\n') });

    const skill = await service().import(
      WS,
      { filename: 'pkg.zip', mimetype: 'application/zip', bytes },
      { type: 'security' },
    );

    expect(repo.insertWithVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WS,
        source: 'imported_file',
        name: 'zip-skill',
        description: 'From an archive.',
        type: 'security',
        body: '# Zip Skill\n\nFrom an archive.\n',
      }),
    );
    expect(skill.source).toBe('imported_file');
  });
});
