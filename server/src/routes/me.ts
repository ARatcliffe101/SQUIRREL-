import { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

export async function meRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: [requireAuth] }, async (req) => {
    const userId = (req.user as any).sub as string;
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, isDisabled: true, createdAt: true }
    });
    return { user: u };
  });
}
