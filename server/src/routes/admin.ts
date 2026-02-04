import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { hashPassword } from '../lib/password.js';
import { requireAuth, requireAdmin } from '../lib/auth.js';

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => { await requireAuth(req); requireAdmin(req); });

  app.get('/admin/users', async () => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, isDisabled: true, createdAt: true }
    });
    return { users };
  });

  app.post('/admin/users', async (req, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(['ADMIN', 'USER']).default('USER'),
    }).parse(req.body);

    const passwordHash = await hashPassword(body.password);
    const user = await prisma.user.create({ data: { email: body.email, passwordHash, role: body.role as any } });
    return reply.code(201).send({ id: user.id });
  });

  app.patch('/admin/users/:id', async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z.object({
      password: z.string().min(8).optional(),
      role: z.enum(['ADMIN', 'USER']).optional(),
      isDisabled: z.boolean().optional(),
    }).parse(req.body);

    const data: any = {};
    if (body.password) data.passwordHash = await hashPassword(body.password);
    if (body.role) data.role = body.role as any;
    if (typeof body.isDisabled === 'boolean') data.isDisabled = body.isDisabled;

    await prisma.user.update({ where: { id: params.id }, data });
    return { ok: true };
  });

  app.delete('/admin/users/:id', async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.user.delete({ where: { id: params.id } });
    return { ok: true };
  });

  app.get('/admin/categories', async () => {
    const categories = await prisma.category.findMany({ orderBy: { name: 'asc' }, include: { sections: true } });
    return { categories };
  });

  app.post('/admin/categories', async (req, reply) => {
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    const c = await prisma.category.create({ data: { name: body.name } });
    return reply.code(201).send({ id: c.id });
  });

  app.patch('/admin/categories/:id', async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z.object({ name: z.string().min(1) }).parse(req.body);
    await prisma.category.update({ where: { id: params.id }, data: { name: body.name } });
    return { ok: true };
  });

  app.delete('/admin/categories/:id', async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.category.delete({ where: { id: params.id } });
    return { ok: true };
  });

  app.post('/admin/categories/:id/sections', async (req, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = z.object({ name: z.string().min(1), sortOrder: z.number().int().optional().default(0) }).parse(req.body);
    const s = await prisma.section.create({ data: { categoryId: params.id, name: body.name, sortOrder: body.sortOrder } });
    return reply.code(201).send({ id: s.id });
  });

  app.delete('/admin/sections/:id', async (req) => {
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    await prisma.section.delete({ where: { id: params.id } });
    return { ok: true };
  });


  app.get('/admin/settings', async () => {
    const s = await prisma.appSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    return { settings: { defaultCategoryId: s.defaultCategoryId, defaultSectionId: s.defaultSectionId } };
  });

  app.patch('/admin/settings', async (req) => {
    const body = z.object({ defaultCategoryId: z.string().nullable().optional(), defaultSectionId: z.string().nullable().optional() }).parse(req.body);
    const s = await prisma.appSetting.upsert({
      where: { id: 1 },
      update: {
        defaultCategoryId: body.defaultCategoryId ?? undefined,
        defaultSectionId: body.defaultSectionId ?? undefined,
      },
      create: {
        id: 1,
        defaultCategoryId: body.defaultCategoryId ?? null,
        defaultSectionId: body.defaultSectionId ?? null,
      },
    });
    return { ok: true, settings: { defaultCategoryId: s.defaultCategoryId, defaultSectionId: s.defaultSectionId } };
  });
}
