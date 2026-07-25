/**
 * db.js — plain Postgres client for the watchdog (node-postgres over TCP).
 * Uses the SAME DATABASE_URL as the fleet (set it in Vercel project env).
 * Not Neon-specific: points at the self-hosted litebill Postgres. Requires
 * the `nodejs` runtime (raw TCP sockets don't work on Vercel's Edge runtime).
 */

const { Pool } = require("pg");

let pool = null;

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
    throw new Error("DATABASE_URL is missing the database name after the hostname (for example /litebill)");
  }
  return value;
}

// pg-connection-string now treats a `sslmode=require` query param as an alias
// for verify-full (CA-verified), which fails against the box's self-signed
// cert regardless of the `ssl` option below. Strip SSL-related params (some
// left over from the old Neon URL, e.g. channel_binding) so TLS is controlled
// solely by the explicit `ssl` option: encrypted, not CA-verified.
function poolConnectionString(rawUrl) {
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");
  return parsed.toString();
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: poolConnectionString(validatedDatabaseUrl()),
    ssl: { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  return pool;
}

function toPositionalQuery(strings, values) {
  let text = strings[0];
  for (let i = 0; i < values.length; i++) {
    text += `$${i + 1}` + strings[i + 1];
  }
  return text;
}

// Keep the exported tagged-template API while delaying environment validation
// until an actual request queries the database. Next.js imports route modules
// during `next build`, where production secrets are intentionally unavailable.
async function sql(strings, ...values) {
  const { rows } = await getPool().query(toPositionalQuery(strings, values), values);
  return rows;
}

module.exports = { sql, getPool, validatedDatabaseUrl };
