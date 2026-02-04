import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';
import { env } from '../lib/env.js';

export async function retentionRoutes(app: FastifyInstance) {
  app.post('/admin/retention/purge', { preHandler: [requireAuth] }, async (req, reply) => {
    requireAdmin(req);

    const body = z.object({ days: z.number().int().min(1).max(3650).optional() }).parse(req.body ?? {});
    const days = body.days ?? env.retentionDays;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const res = await prisma.entry.deleteMany({
      where: { deletedAt: { not: null, lt: cutoff } }
    });

    return reply.send({ ok: true, purged: res.count, cutoff });
  });
}
