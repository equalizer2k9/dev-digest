import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module (spec §1). Transport only: zod schemas at the edge, the
 * workspace from `getContext`, status codes. Every route is workspace-scoped by
 * the service, so a repo or candidate from another workspace 404s, never 403s.
 *
 *   POST /repos/:id/conventions/extract  → ConventionScan (one model round-trip)
 *   GET  /repos/:id/conventions          → ConventionScan (extracted_at null = never scanned)
 *   PUT  /conventions/:id                → ConventionCandidate
 *   GET  /repos/:id/conventions/draft    → ConventionSkillDraft (409 with nothing accepted)
 *   POST /repos/:id/conventions/skill    → Skill (201)
 */

/** At least one field — an empty PUT is a 422, not a silent no-op write. */
const UpdateConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(8).max(240).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined || b.category !== undefined, {
    message: 'Provide at least one of status, rule or category',
  });

/** The draft as the user edited it, plus the optional agent to link it to. */
const CreateConventionSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SkillType.optional(),
  enabled: z.boolean().optional(),
  body: z.string().min(1),
  agent_id: z.string().uuid().optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  // Synchronous by design: one model round-trip, tens of seconds. `req.log`
  // carries the dropped-evidence reasons into the server log.
  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id, req.log);
  });

  // Static segments win over `/:id` in find-my-way, so `draft`/`skill`/`extract`
  // are matched ahead of any sibling id route regardless of declaration order.
  app.get('/repos/:id/conventions/draft', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.draft(workspaceId, req.params.id);
  });

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateConventionSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, {
        name: req.body.name,
        ...(req.body.description !== undefined ? { description: req.body.description } : {}),
        ...(req.body.type !== undefined ? { type: req.body.type } : {}),
        ...(req.body.enabled !== undefined ? { enabled: req.body.enabled } : {}),
        body: req.body.body,
        ...(req.body.agent_id !== undefined ? { agentId: req.body.agent_id } : {}),
      });
      reply.status(201);
      return skill;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.get(workspaceId, req.params.id);
  });

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCandidate(workspaceId, req.params.id, req.body);
    },
  );
}
