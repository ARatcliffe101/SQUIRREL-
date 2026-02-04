import { FastifyInstance } from 'fastify';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

function getPkgVersion(): string {
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const pkgPath = path.join(__dirname, '..', '..', 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const j = JSON.parse(raw);
    return j.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

function parseDbInfo(databaseUrl: string): { dbType: 'sqlite' | 'postgres' | 'unknown'; dbPath: string | null } {
  if (databaseUrl.startsWith('file:')) {
    const p = databaseUrl.slice('file:'.length);
    return { dbType: 'sqlite', dbPath: p || null };
  }
  if (databaseUrl.startsWith('postgres') || databaseUrl.startsWith('postgresql')) {
    return { dbType: 'postgres', dbPath: null };
  }
  return { dbType: 'unknown', dbPath: null };
}

export async function configRoutes(app: FastifyInstance) {
  app.get('/config', async () => {
    const version = getPkgVersion();
    const db = parseDbInfo(process.env.DATABASE_URL ?? '');
    const setting = await prisma.appSetting.findUnique({ where: { id: 1 } });
    return {
      appVersion: version,
      environment: env.appEnv,
      dbType: db.dbType,
      dbPath: db.dbPath,
      defaults: {
        defaultCategoryId: setting?.defaultCategoryId ?? null,
        defaultSectionId: setting?.defaultSectionId ?? null,
      }
    };
  });
}
