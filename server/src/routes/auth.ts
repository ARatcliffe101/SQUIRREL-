import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { verifyPassword } from '../lib/password.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user || user.isDisabled) return reply.code(401).send({ error: 'Invalid credentials' });

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) return reply.code(401).send({ error: 'Invalid credentials' });

    const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
    const refreshToken = app.jwtRefresh.sign({ sub: user.id, role: user.role });

    return { accessToken, refreshToken, user: { id: user.id, email: user.email, role: user.role } };
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    try {
      const payload = app.jwtRefresh.verify(body.refreshToken) as any;
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.isDisabled) return reply.code(401).send({ error: 'Invalid token' });
      const accessToken = app.jwt.sign({ sub: user.id, role: user.role });
      return { accessToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  });
}
