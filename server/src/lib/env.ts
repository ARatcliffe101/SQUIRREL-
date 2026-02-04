import 'dotenv/config';

export function mustEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  appEnv: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'dev',
  retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
  port: Number(process.env.PORT ?? 8787),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtAccessSecret: mustEnv('JWT_ACCESS_SECRET', 'dev-access-secret'),
  jwtRefreshSecret: mustEnv('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
  accessTtl: process.env.ACCESS_TOKEN_TTL ?? '15m',
  refreshTtl: process.env.REFRESH_TOKEN_TTL ?? '30d',
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@example.com',
  bootstrapAdminPassword: process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'admin1234',
};
