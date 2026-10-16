import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentOverview,
  EvalCaseCreated,
  EvalCaseDraft,
  EvalCaseEdit,
  EvalCaseRow,
  EvalSingleRun,
  EvalCompare,
  EvalDashboard,
  EvalRunRecord,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

/**
 * Eval pipeline (transport only; the service owns every rule).
 *
 *   GET    /findings/:id/eval-case/draft        → EvalCaseDraft (no model call, stores nothing)
 *   POST   /findings/:id/eval-case              → 201 EvalCaseCreated (200 when it already existed);
 *                                                 optional body EvalCaseEdit (name + zone)
 *   POST   /findings/:id/eval-case/run          → EvalSingleRun of the unsaved case (body EvalCaseEdit)
 *   PATCH  /agents/:id/evals/cases/:caseId      → EvalCaseRow (body EvalCaseEdit)
 *   POST   /agents/:id/evals/cases/:caseId/run  → EvalSingleRun of the stored case
 *   GET    /agents/:id/evals                    → EvalAgentOverview
 *   DELETE /agents/:id/evals/cases/:caseId      → 204
 *   POST   /agents/:id/evals/runs               → 202 EvalRunRecord (running)
 *   GET    /evals/compare?a=&b=                 → EvalCompare
 *   GET    /evals/dashboard                     → EvalDashboard
 */

const CaseParams = z.object({ id: z.string().uuid(), caseId: z.string().uuid() });
const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

export default async function routes(fastify: FastifyInstance): Promise<void> {
  const app = fastify.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);

  app.get(
    '/findings/:id/eval-case/draft',
    { schema: { params: IdParams, response: { 200: EvalCaseDraft } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.caseDraft(workspaceId, req.params.id);
    },
  );

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        // No body arrives as null (the client posts without one), so accept both.
        body: EvalCaseEdit.nullish(),
        response: { 200: EvalCaseCreated, 201: EvalCaseCreated },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const out = await service.createCase(workspaceId, req.params.id, req.body ?? undefined);
      reply.code(out.created ? 201 : 200);
      return out;
    },
  );

  app.post(
    '/findings/:id/eval-case/run',
    { schema: { params: IdParams, body: EvalCaseEdit, response: { 200: EvalSingleRun } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runDraftCase(workspaceId, req.params.id, req.body, req.log);
    },
  );

  app.get(
    '/agents/:id/evals',
    { schema: { params: IdParams, response: { 200: EvalAgentOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.overview(workspaceId, req.params.id);
    },
  );

  app.delete('/agents/:id/evals/cases/:caseId', { schema: { params: CaseParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    await service.deleteCase(workspaceId, req.params.id, req.params.caseId);
    return reply.code(204).send();
  });

  app.patch(
    '/agents/:id/evals/cases/:caseId',
    { schema: { params: CaseParams, body: EvalCaseEdit, response: { 200: EvalCaseRow } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.updateCase(workspaceId, req.params.id, req.params.caseId, req.body);
    },
  );

  app.post(
    '/agents/:id/evals/cases/:caseId/run',
    { schema: { params: CaseParams, response: { 200: EvalSingleRun } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.runCase(workspaceId, req.params.id, req.params.caseId, req.log);
    },
  );

  app.post(
    '/agents/:id/evals/runs',
    { schema: { params: IdParams, response: { 202: EvalRunRecord } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const run = await service.startRun(workspaceId, req.params.id, req.log);
      reply.code(202);
      return run;
    },
  );

  app.get(
    '/evals/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get('/evals/dashboard', { schema: { response: { 200: EvalDashboard } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });
}
