import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { registerAuth } from './lib/auth.js';
import { authRoutes } from './routes/auth.js';
import { meRoutes } from './routes/me.js';
import { categoryRoutes } from './routes/categories.js';
import { entryRoutes } from './routes/entries.js';
import { adminRoutes } from './routes/admin.js';
import { webuiRoutes } from './routes/webui.js';
import { configRoutes } from './routes/config.js';
import { retentionRoutes } from './routes/retention.js';
import { hashPassword } from './lib/password.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: env.corsOrigin, credentials: true });
await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

await registerAuth(app);

app.get('/health', async () => ({ ok: true }));

await app.register(authRoutes);
await app.register(meRoutes);
await app.register(categoryRoutes);
await app.register(entryRoutes);
await app.register(adminRoutes);
await app.register(webuiRoutes);
await app.register(configRoutes);
await app.register(retentionRoutes);

async function bootstrapAdminIfNeeded() {
  const count = await prisma.user.count();
  if (count > 0) return;

  const passwordHash = await hashPassword(env.bootstrapAdminPassword);
  await prisma.user.create({ data: { email: env.bootstrapAdminEmail, passwordHash, role: 'ADMIN' } });

  const cat = await prisma.category.create({ data: { name: 'General' } });
  await prisma.appSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1, defaultCategoryId: cat.id, defaultSectionId: null } });
  await prisma.section.createMany({
    data: [
      { categoryId: cat.id, name: 'Inbox', sortOrder: 0 },
      { categoryId: cat.id, name: 'Reference', sortOrder: 1 },
    ]
  });

  app.log.info(`Bootstrapped admin ${env.bootstrapAdminEmail}`);
}

app.setErrorHandler((err, _req, reply) => {
  const status = (err as any).statusCode ?? 500;
  reply.code(status).send({ error: err.message ?? 'Server error' });
});

await bootstrapAdminIfNeeded();
await app.listen({ port: env.port, host: '0.0.0.0' });
