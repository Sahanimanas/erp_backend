/**
 * Vercel serverless entry point.
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel serves the API as a single serverless function. This file just exports
 * the already-compiled Express app (dist/app.js — produced by `vercel-build`),
 * and vercel.json rewrites every incoming path to here.
 *
 * IMPORTANT (read VERCEL_DEPLOY.md):
 *  - The BullMQ worker is a long-running process and CANNOT run on Vercel.
 *    Run it on a small always-on host (Render / Railway / a VPS).
 *  - DATABASE_URL must be a POOLED connection (PgBouncer / Neon pooler /
 *    Supabase pooler / Prisma Accelerate) — serverless opens many short-lived
 *    connections and will exhaust a direct Postgres connection otherwise.
 */
const app = require("../dist/app").default;

module.exports = app;
