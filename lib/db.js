/**
 * db.js — Neon serverless client for the watchdog.
 * Uses the SAME DATABASE_URL as the fleet (set it in Vercel project env).
 */

const { neon } = require("@neondatabase/serverless");

let client = null;

function validatedDatabaseUrl() {
  const value = String(process.env.DATABASE_URL || "").trim();
  if (!value) {
    throw new Error("DATABASE_URL is not set (Vercel project env)");
  }
  if (/^DATABASE_URL\s*=/i.test(value)) {
    throw new Error("DATABASE_URL value must contain only the PostgreSQL URL, without 'DATABASE_URL='");
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
  }
  if (!parsed.hostname || !parsed.username) {
    throw new Error("DATABASE_URL is missing its database host or username");
  }
  if (!parsed.pathname || parsed.pathname === "/") {
    throw new Error("DATABASE_URL is missing the database name after the hostname (for example /neondb)");
  }
  return value;
}

function getClient() {
  if (client) return client;
  client = neon(validatedDatabaseUrl());
  return client;
}

// Keep the exported tagged-template API while delaying environment validation
// until an actual request queries the database. Next.js imports route modules
// during `next build`, where production secrets are intentionally unavailable.
function sql(strings, ...values) {
  return getClient()(strings, ...values);
}

module.exports = { sql, getClient, validatedDatabaseUrl };
