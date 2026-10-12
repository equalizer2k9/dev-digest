import Fastify, { type RouteOptions } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Container } from '../../platform/container.js';
import briefRoutes from './routes.js';

/** Route options as registered; the global limiter is off under test, so the config is the subject. */
async function registered(): Promise<RouteOptions[]> {
  const app = Fastify();
  app.decorate('container', {} as Container);
  const routes: RouteOptions[] = [];
  app.addHook('onRoute', (r) => {
    routes.push(r);
  });
  await app.register(briefRoutes);
  await app.after();
  return routes;
}

describe('brief routes — rate limit (security review F1)', () => {
  it('POST /pulls/:id/brief carries the tight per-route limit of the paid model routes', async () => {
    const post = (await registered()).find((r) => r.method === 'POST' && r.url === '/pulls/:id/brief');
    expect(post?.config).toMatchObject({ rateLimit: { max: 10, timeWindow: '1 minute' } });
  });

  it('GET /pulls/:id/brief makes no model call and keeps the global limit only', async () => {
    const get = (await registered()).find((r) => r.method === 'GET' && r.url === '/pulls/:id/brief');
    expect(get).toBeDefined();
    expect((get?.config as { rateLimit?: unknown } | undefined)?.rateLimit).toBeUndefined();
  });
});
