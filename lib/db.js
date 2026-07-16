/**
 * db.js — Neon serverless client for the watchdog.
 * Uses the SAME DATABASE_URL as the fleet (set it in Vercel project env).
 */

const { neon } = require("@neondatabase/serverless");

let client;

function getSql() {
  if (client) return client;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set (Vercel project env)");
  }

  client = neon(databaseUrl);
  return client;
}

// Keep the existing tagged-template API, but do not read
// DATABASE_URL while Next.js imports route modules during `next build`.
function sql(strings, ...values) {
  return getSql()(strings, ...values);
}

module.exports = { sql, getSql };
