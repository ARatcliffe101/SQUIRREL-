import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/categories', { preHandler: [requireAuth] }, async () => {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: { sections: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] } },
    });
    return { categories };
  });
}
