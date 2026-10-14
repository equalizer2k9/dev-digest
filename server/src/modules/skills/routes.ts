import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_UPLOAD_BYTES } from './constants.js';
import type { ImportOverrides, UploadedFile } from './helpers.js';
import { SkillsService } from './service.js';

/**
 * Skills module (spec §1). Transport only: zod schemas at the edge, the
 * workspace from `getContext`, status codes. Every route is workspace-scoped
 * by the service, so a skill from another workspace 404s rather than 403s.
 *
 *   GET    /skills                        → SkillWithUsage[] (name ascending)
 *   GET    /skills/:id                    → Skill
 *   POST   /skills                        → Skill (201)
 *   PUT    /skills/:id                    → Skill
 *   DELETE /skills/:id                    → 204
 *   GET    /skills/:id/versions           → SkillVersion[] (version descending)
 *   GET    /skills/:id/versions/:version  → SkillVersion
 *   POST   /skills/:id/restore            → Skill
 *   POST   /skills/import/preview         → SkillImportPreview (persists nothing)
 *   POST   /skills/import                 → Skill (201)
 */

/** `/skills/:id/versions/:version` — id is a uuid, version a positive integer. */
const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
});

const RestoreBody = z.object({ version: z.number().int().positive() });

/**
 * The buffered upload, attached to `req.body.file` by @fastify/multipart's
 * `attachFieldsToBody: 'keyValues'` + our `onFile`. Validated at the route like
 * any other body field — never `Schema.parse`d inside a handler.
 */
const UploadPart = z.custom<UploadedFile>(
  (value) =>
    typeof value === 'object' &&
    value !== null &&
    ArrayBuffer.isView((value as UploadedFile).bytes),
  { message: 'Attach the skill file as a multipart field named "file"' },
);

/** file + the optional corrections the user made on the preview. */
const ImportBody = z.object({
  file: UploadPart,
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
});

function overridesOf(body: z.infer<typeof ImportBody>): ImportOverrides {
  return {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.type !== undefined ? { type: body.type } : {}),
  };
}

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  // Upload parsing. `limits.fileSize` cuts an oversized body off at the socket
  // instead of buffering it whole; `throwFileSizeLimit: false` lets us answer
  // with our own 413 message (the parser re-checks the size anyway).
  await app.register(multipart, {
    attachFieldsToBody: 'keyValues',
    throwFileSizeLimit: false,
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 8, parts: 12 },
    onFile: async (part) => {
      const bytes = await part.toBuffer();
      (part as unknown as { value: UploadedFile }).value = {
        filename: part.filename ?? '',
        mimetype: part.mimetype ?? '',
        bytes,
        truncated: part.file.truncated === true,
      };
    },
  });

  app.get('/skills', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  // Static segments win over `/skills/:id` in find-my-way, so the import routes
  // are matched ahead of the id route regardless of declaration order.
  app.post('/skills/import/preview', { schema: { body: ImportBody } }, async (req) => {
    await getContext(app.container, req);
    return service.preview(req.body.file, overridesOf(req.body));
  });

  app.post('/skills/import', { schema: { body: ImportBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.import(workspaceId, req.body.file, overridesOf(req.body));
    reply.status(201);
    return skill;
  });

  app.get('/skills/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.post('/skills', { schema: { body: CreateSkillBody } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const skill = await service.create(workspaceId, req.body);
    reply.status(201);
    return skill;
  });

  app.put('/skills/:id', { schema: { params: IdParams, body: UpdateSkillBody } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.update(workspaceId, req.params.id, req.body);
  });

  app.delete('/skills/:id', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.delete(workspaceId, req.params.id);
    return reply.status(204).send();
  });

  app.get('/skills/:id/versions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.listVersions(workspaceId, req.params.id);
  });

  app.get('/skills/:id/versions/:version', { schema: { params: VersionParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.getVersion(workspaceId, req.params.id, req.params.version);
  });

  app.post(
    '/skills/:id/restore',
    { schema: { params: IdParams, body: RestoreBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.restore(workspaceId, req.params.id, req.body.version);
    },
  );
}
