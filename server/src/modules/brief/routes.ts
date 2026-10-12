import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefGenerateInput, PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BriefService } from './service.js';

/**
 * PR Brief module.
 *   GET  /pulls/:id/brief → the stored brief, or { brief: null } (never a model call)
 *   POST /pulls/:id/brief → generate (ONE model call) and store; body { head_sha }
 */
// Tight per-route limit, as on the review routes: each call is a paid model request.
const GENERATE_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService(container, app.log);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, body: PrBriefGenerateInput, response: { 200: PrBriefResponse } },
      config: { rateLimit: GENERATE_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.body.head_sha);
    },
  );
}
