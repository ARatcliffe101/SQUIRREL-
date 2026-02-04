# PromptVault (server + Electron app + Web Admin UI)

Self-hosted prompt/output vault with:
- user login + admin routes (users, categories, sections)
- Electron UI (OneNote-ish: categories sidebar, section tabs, entries list + editor)
- tagging + search
- soft delete + hard delete
- **Web Admin UI** served by the server at `/ui`

## Quick start (SQLite dev)

### 1) Server
```bash
cd server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

- API: http://localhost:8787
- Web Admin UI: http://localhost:8787/ui

First run bootstraps an admin user if no users exist:
- email: admin@example.com
- password: admin1234

> Use Node **20 or 22 LTS**. Node 25 is not recommended.

### 2) Electron App
```bash
cd app
cp .env.example .env
npm install
npm run dev
```

## Production notes
- Switch DB to PostgreSQL by setting `DATABASE_URL` in `server/.env`
- Put the server behind HTTPS (Caddy/Nginx) and set strong JWT secrets.

## Common issue: ERR_MODULE_NOT_FOUND @prisma/client
This means dependencies or Prisma client weren’t generated.

Fix:
```bash
cd server
npm install
npm run prisma:generate
```


### SQLite note
This repo uses SQLite by default for dev. Prisma enums are avoided for SQLite compatibility; `User.role` is stored as a string constrained by API validation.


## If npm audit warns about vulnerabilities
Run `npm audit` to see the exact package. If it’s a transitive dev dependency you may choose to ignore in local dev. Otherwise run `npm audit fix` (avoid `--force` unless you accept breaking changes).


## Electron dev error: Unknown file extension ".ts"
Electron cannot load a TypeScript main process directly. This repo uses `app/electron/main.cjs` as the main entry, so `npm run dev` works without TS in the Electron main.


## Entry fields
Each entry stores: title (optional), prompt, output, model used (required), comments (optional), tags. Users can soft delete (Delete) or hard delete (Purge).


## GET /config
Returns server version, environment, DB type/path, and defaults.


## Retention purge
Admin: POST /admin/retention/purge (days optional) purges soft-deleted entries older than RETENTION_DAYS.


## App 0.2.1
Fixes missing exports in app/src/ui/api.ts (getApiBase/setApiBase).
