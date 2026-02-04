import { FastifyInstance } from 'fastify';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

function webuiDir(): string {
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  return path.join(__dirname, '..', '..', 'webui');
}

async function sendFile(reply: any, filename: string, contentType: string) {
  const full = path.join(webuiDir(), filename);
  const data = await fs.readFile(full);
  reply.header('Content-Type', contentType);
  reply.send(data);
}

export async function webuiRoutes(app: FastifyInstance) {
  app.get('/ui', async (_req, reply) => sendFile(reply, 'index.html', 'text/html; charset=utf-8'));
  app.get('/ui/app.js', async (_req, reply) => sendFile(reply, 'app.js', 'application/javascript; charset=utf-8'));
  app.get('/ui/styles.css', async (_req, reply) => sendFile(reply, 'styles.css', 'text/css; charset=utf-8'));
}
