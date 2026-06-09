# Deploying the backend to Vercel

The backend runs as a **single serverless function** on Vercel. `api/index.js`
exports the compiled Express app (`dist/app.js`) and `vercel.json` rewrites every
request to it.

## Steps

1. Push the repo to GitHub/GitLab.
2. In Vercel → **New Project** → import the repo.
3. **Set Root Directory = `backend`** (important — the repo has `backend/` and
   `frontend/`).
4. Framework Preset: **Other**. Build/Install/Output are already defined in
   `vercel.json` (`vercel-build` runs `prisma generate && tsc && tsc-alias`).
5. Add the Environment Variables below.
6. Deploy.

## Required environment variables

| Var | Notes |
|-----|-------|
| `DATABASE_URL` | **Must be a POOLED connection** (see below). |
| `JWT_ACCESS_SECRET` | long random string |
| `JWT_REFRESH_SECRET` | long random string |
| `JWT_ACCESS_EXPIRES_IN` | e.g. `15m` |
| `JWT_REFRESH_EXPIRES_IN` | e.g. `7d` |
| `FRONTEND_URL` | your frontend origin (for CORS) |
| `NODE_ENV` | `production` |
| `PLATFORM_DOMAIN` | e.g. `myerp.com` |
| R2/S3 keys (`R2_*` / `AWS_*`) | for file uploads — required, local disk is ephemeral on Vercel |
| `REDIS_URL` | only if a serverless route touches Redis; the **worker** runs elsewhere |

## ⚠️ Two things Vercel can't do for this app

1. **The BullMQ worker cannot run on Vercel.** Vercel has no long-running
   processes, so bulk import / ID-card & PDF generation / bulk SMS jobs won't be
   processed. Run the worker on a small always-on host — **Render / Railway
   background worker, or a cheap VPS** — pointing at the same Redis + DB.

2. **Use a POOLED `DATABASE_URL`.** Each serverless invocation can open its own
   Postgres connection; a direct connection string will exhaust the DB. Use one of:
   - **Neon** pooled URL (`...-pooler...`), or **Supabase** pooler (port 6543), or
   - **PgBouncer** in front of your Postgres, or
   - **Prisma Accelerate**.
   Append `?pgbouncer=true&connection_limit=1` when using a transaction pooler.

## Notes
- `prisma/schema.prisma` includes `binaryTargets = ["native", "rhel-openssl-3.0.x"]`
  so the Prisma engine works both locally and on Vercel's Lambda runtime.
- Run DB migrations from your machine/CI against the production DB:
  `DATABASE_URL=... npx prisma migrate deploy` (don't run migrations inside the
  serverless function).
- Subdomain-based tenant resolution falls back to the JWT's `schoolId` on Vercel
  domains, so the API works without wildcard DNS; wildcard subdomains still need
  DNS + a custom domain.

> Vercel is great for the API surface, but for this stack (long-running worker +
> pooled DB) a single always-on host like **Render/Railway/Fly/VPS** is often
> simpler. The `Dockerfile` in this folder deploys the whole thing (API + worker)
> on any of those.
