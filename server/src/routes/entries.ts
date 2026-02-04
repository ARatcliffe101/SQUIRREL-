import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../lib/auth.js';

const createSchema = z.object({
  categoryId: z.string().min(1),
  sectionId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  promptText: z.string().min(1),
  outputText: z.string().min(1),
  modelUsed: z.string().min(1),
  comments: z.string().optional().nullable(),
  tags: z.array(z.string().min(1)).optional().default([]),
});
const updateSchema = createSchema.partial();

export async function entryRoutes(app: FastifyInstance) {
  app.get('/entries', { preHandler: [requireAuth] }, async (req) => {
    const userId = (req.user as any).sub as string;
    const q = z.object({
      query: z.string().optional(),
      categoryId: z.string().optional(),
      sectionId: z.string().optional(),
      tag: z.string().optional(),
      includeDeleted: z.string().optional(),
      take: z.string().optional(),
    }).parse(req.query);

    const includeDeleted = q.includeDeleted === 'true';
    const take = Math.min(Number(q.take ?? 100), 500);

    const where: any = { userId };
    if (!includeDeleted) where.deletedAt = null;
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.sectionId) where.sectionId = q.sectionId;

    if (q.query) {
      where.OR = [
        { title: { contains: q.query, mode: 'insensitive' } },
        { promptText: { contains: q.query, mode: 'insensitive' } },
        { outputText: { contains: q.query, mode: 'insensitive' } },
      ];
    }

    const entries = await prisma.entry.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take,
      include: { tags: { include: { tag: true } } }
    });

    let filtered = entries;
    if (q.tag) {
      const tagLower = q.tag.toLowerCase();
      filtered = entries.filter(e => e.tags.some(t => t.tag.name.toLowerCase() === tagLower));
    }

    return {
      entries: filtered.map(e => ({
        id: e.id,
        title: e.title,
        promptText: e.promptText,
        outputText: e.outputText,
        modelUsed: (e as any).modelUsed,
        comments: (e as any).comments,
        categoryId: e.categoryId,
        sectionId: e.sectionId,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
        deletedAt: e.deletedAt,
        tags: e.tags.map(t => ({ id: t.tagId, name: t.tag.name })),
      }))
    };
  });

  app.post('/entries', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const body = createSchema.parse(req.body);

    const entry = await prisma.entry.create({
      data: {
        userId,
        categoryId: body.categoryId,
        sectionId: body.sectionId ?? null,
        title: body.title ?? null,
        promptText: body.promptText,
        outputText: body.outputText,
        modelUsed: body.modelUsed,
        comments: body.comments ?? null,
      }
    });

    for (const t of body.tags) {
      const tag = await prisma.tag.upsert({
        where: { userId_name: { userId, name: t.trim() } },
        update: {},
        create: { userId, name: t.trim() },
      });
      await prisma.entryTag.upsert({
        where: { entryId_tagId: { entryId: entry.id, tagId: tag.id } },
        update: {},
        create: { entryId: entry.id, tagId: tag.id },
      });
    }

    return reply.code(201).send({ id: entry.id });
  });

  app.patch('/entries/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const body = updateSchema.parse(req.body);

    const exists = await prisma.entry.findFirst({ where: { id: params.id, userId } });
    if (!exists) return reply.code(404).send({ error: 'Not found' });

    await prisma.entry.update({
      where: { id: params.id },
      data: {
        categoryId: body.categoryId ?? undefined,
        sectionId: body.sectionId ?? undefined,
        title: body.title ?? undefined,
        promptText: body.promptText ?? undefined,
        outputText: body.outputText ?? undefined,
        modelUsed: (body as any).modelUsed ?? undefined,
        comments: (body as any).comments ?? undefined,
      }
    });

    if (body.tags) {
      await prisma.entryTag.deleteMany({ where: { entryId: params.id } });
      for (const t of body.tags) {
        const tag = await prisma.tag.upsert({
          where: { userId_name: { userId, name: t.trim() } },
          update: {},
          create: { userId, name: t.trim() },
        });
        await prisma.entryTag.upsert({
          where: { entryId_tagId: { entryId: params.id, tagId: tag.id } },
          update: {},
          create: { entryId: params.id, tagId: tag.id },
        });
      }
    }

    return { ok: true };
  });

  app.delete('/entries/:id', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const exists = await prisma.entry.findFirst({ where: { id: params.id, userId } });
    if (!exists) return reply.code(404).send({ error: 'Not found' });
    await prisma.entry.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return { ok: true };
  });

app.post('/entries/:id/restore', { preHandler: [requireAuth] }, async (req, reply) => {
  const userId = (req.user as any).sub as string;
  const params = z.object({ id: z.string().min(1) }).parse(req.params);
  const exists = await prisma.entry.findFirst({ where: { id: params.id, userId } });
  if (!exists) return reply.code(404).send({ error: 'Not found' });
  await prisma.entry.update({ where: { id: params.id }, data: { deletedAt: null } });
  return { ok: true };
});

app.delete('/entries/:id/hard', { preHandler: [requireAuth] }, async (req, reply) => {
    const userId = (req.user as any).sub as string;
    const params = z.object({ id: z.string().min(1) }).parse(req.params);
    const exists = await prisma.entry.findFirst({ where: { id: params.id, userId } });
    if (!exists) return reply.code(404).send({ error: 'Not found' });
    await prisma.entry.delete({ where: { id: params.id } });
    return { ok: true };
  });
}
