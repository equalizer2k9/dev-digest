import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ProjectContextAttachInput,
  ProjectContextAttachments,
  ProjectContextList,
  ProjectContextPreview,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { MAX_PATH_CHARS } from './constants.js';
import type { ContextOwner } from './repository.js';

/**
 * Project context (transport only; the service owns every rule).
 *
 *   GET /repos/:id/context              → ProjectContextList
 *   GET /repos/:id/context/document     → ProjectContextPreview (?path=)
 *   GET /agents/:id/context?repo_id=    → ProjectContextAttachments
 *   PUT /agents/:id/context             → ProjectContextAttachments (replaces the list)
 *   GET /skills/:id/context?repo_id=    → ProjectContextAttachments
 *   PUT /skills/:id/context             → ProjectContextAttachments (replaces the list)
 */

const PreviewQuery = z.object({ path: z.string().min(1).max(MAX_PATH_CHARS) });
const OwnerQuery = z.object({ repo_id: z.string().uuid() });

export default async function routes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = () => app.container.projectContext;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectContextList } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/document',
    { schema: { params: IdParams, querystring: PreviewQuery, response: { 200: ProjectContextPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service().preview(workspaceId, req.params.id, req.query.path);
    },
  );

  for (const kind of ['agent', 'skill'] as const) {
    const base = `/${kind}s/:id/context`;
    const owner = (id: string): ContextOwner => ({ kind, id });

    app.get(
      base,
      { schema: { params: IdParams, querystring: OwnerQuery, response: { 200: ProjectContextAttachments } } },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return service().getAttachments(workspaceId, owner(req.params.id), req.query.repo_id);
      },
    );

    app.put(
      base,
      { schema: { params: IdParams, body: ProjectContextAttachInput, response: { 200: ProjectContextAttachments } } },
      async (req) => {
        const { workspaceId } = await getContext(app.container, req);
        return service().setAttachments(workspaceId, owner(req.params.id), req.body);
      },
    );
  }
}
