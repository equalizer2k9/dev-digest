import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentEstimates, MultiRunDetail, MultiRunList, MultiRunListQuery } from '@devdigest/shared';
import { getContext } from '../../_shared/context.js';
import { IdParams } from '../../_shared/schemas.js';
import type { MultiRunService } from './multi-run-service.js';

/**
 * Multi-agent run reads (the launch is `POST /pulls/:id/review` with `agentIds`).
 *
 *   GET /multi-runs?pr_id=     → MultiRunList (<= 20, newest first)
 *   GET /multi-runs/estimates  → AgentEstimates (every enabled agent)
 *   GET /multi-runs/:id        → MultiRunDetail (404 for another workspace)
 */
export default async function multiRunRoutes(
  appBase: FastifyInstance,
  opts: { service: MultiRunService },
): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const { service } = opts;

  app.get(
    '/multi-runs',
    { schema: { querystring: MultiRunListQuery, response: { 200: MultiRunList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.query.pr_id);
    },
  );

  // Static segment wins over `/:id` in find-my-way.
  app.get('/multi-runs/estimates', { schema: { response: { 200: AgentEstimates } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.estimates(workspaceId);
  });

  app.get(
    '/multi-runs/:id',
    { schema: { params: IdParams, response: { 200: MultiRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );
}
