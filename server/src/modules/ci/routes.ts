import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiBundleInput,
  CiInstallInput,
  CiInstallResult,
  CiInstallation,
  CiPreview,
  CiRefreshResult,
  CiRunsResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiService } from './service.js';

/**
 * Export to CI (transport only; the service owns every rule).
 *
 *   GET  /agents/:id/ci/installations → CiInstallation[]
 *   POST /agents/:id/ci/preview       → CiPreview
 *   POST /agents/:id/ci/install       → CiInstallResult
 *   GET  /ci/runs?agent_id=           → CiRunsResponse
 *   POST /ci/runs/refresh             → CiRefreshResult (ingests from GitHub first)
 */

const RunsQuery = z.object({ agent_id: z.string().uuid().optional() });

export default async function routes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new CiService(app.container);

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.installations(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiBundleInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    { schema: { params: IdParams, body: CiInstallInput, response: { 200: CiInstallResult } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.install(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: RunsQuery, response: { 200: CiRunsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.listRuns(workspaceId, req.query.agent_id);
    },
  );

  app.post('/ci/runs/refresh', { schema: { response: { 200: CiRefreshResult } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.refresh(workspaceId, req.log);
  });
}
