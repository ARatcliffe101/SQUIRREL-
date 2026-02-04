import { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from './env.js';

export type JwtPayload = { sub: string; role: 'ADMIN' | 'USER' };

export async function registerAuth(app: FastifyInstance) {
  await app.register(import('@fastify/jwt'), {
    secret: env.jwtAccessSecret,
    sign: { expiresIn: env.accessTtl },
  });

  app.decorate('jwtRefresh', {
    sign: (payload: object) => app.jwt.sign(payload as any, { secret: env.jwtRefreshSecret, expiresIn: env.refreshTtl }),
    verify: (token: string) => app.jwt.verify(token, { secret: env.jwtRefreshSecret }),
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    jwtRefresh: {
      sign: (payload: object) => string;
      verify: (token: string) => any;
    };
  }
  interface FastifyRequest {
    user?: JwtPayload;
  }
}

export async function requireAuth(req: FastifyRequest) {
  await req.jwtVerify<JwtPayload>();
}

export function requireAdmin(req: FastifyRequest) {
  if ((req.user as any)?.role !== 'ADMIN') {
    const err: any = new Error('Admin only');
    err.statusCode = 403;
    throw err;
  }
}
