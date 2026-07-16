/**
 * db.js — Neon serverless client for the watchdog.
 * Uses the SAME DATABASE_URL as the fleet (set it in Vercel project env).
 */

const { neon } = require("@neondatabase/serverless");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (Vercel project env)");
}

const sql = neon(process.env.DATABASE_URL);

module.exports = { sql };
