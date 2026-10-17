import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPerformance, AgentStats, PerfPeriodQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AgentPerformanceService } from './service.js';

/**
 * Agent performance (transport only; reads stored runs, never calls a model).
 *
 *   GET /agent-performance   ?period=1d|30d|custom&from=&to= → AgentPerformance
 *   GET /agents/:id/stats    same query                       → AgentStats
 */
export default async function routes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new AgentPerformanceService(app.container);

  app.get(
    '/agent-performance',
    { schema: { querystring: PerfPeriodQuery, response: { 200: AgentPerformance } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.performance(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/stats',
    { schema: { params: IdParams, querystring: PerfPeriodQuery, response: { 200: AgentStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.stats(workspaceId, req.params.id, req.query);
    },
  );
}
