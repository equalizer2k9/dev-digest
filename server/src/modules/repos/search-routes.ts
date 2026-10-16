import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { getContext } from '../_shared/context.js';

/**
 * GET /repos/search?name= — repositories of the workspace whose full name contains `name`.
 */
export default async function repoSearchRoutes(app: FastifyInstance) {
  app.get('/repos/search', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const name = String((req.query as { name?: string }).name ?? '');
    const rows = await app.container.db.execute(
      sql.raw(
        `select id, full_name from repos where workspace_id = '${workspaceId}' and full_name ilike '%${name}%' order by full_name limit 50`,
      ),
    );
    return rows;
  });
}
