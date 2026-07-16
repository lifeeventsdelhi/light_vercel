/**
 * db.js — Neon serverless client for the watchdog.
 * Uses the SAME DATABASE_URL as the fleet (set it in Vercel project env).
 */

const { neon } = require("@neondatabase/serverless");

let client = null;

function getClient() {
  if (client) return client;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (Vercel project env)");
  }
  client = neon(process.env.DATABASE_URL);
  return client;
}

// Keep the exported tagged-template API while delaying environment validation
// until an actual request queries the database. Next.js imports route modules
// during `next build`, where production secrets are intentionally unavailable.
function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

module.exports = { sql, getClient };
