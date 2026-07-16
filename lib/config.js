/**
 * config.js — watchdog configuration.
 * (production_ready_plan_draft_v3 C8 + A2)
 */

// ─── FAILOVER MODE — comment/uncomment (draft v3 A2) ─────────────────────────
// front_door : ACTIVE NOW. This Vercel app is the stable public URL; every
//              request is PROXIED server-side to the current main's latest
//              quick-tunnel URL. Clients never see the tunnel URL.
// dns_switch : uncomment AFTER the domain is purchased + named tunnels exist.
//              The public hostname's CNAME is repointed between the two
//              mains' fixed tunnel hostnames via the Cloudflare API.
//              (Also set CF_API_TOKEN, CF_ZONE_ID, PUBLIC_HOSTNAME,
//               T1_TUNNEL_HOSTNAME, T2_TUNNEL_HOSTNAME on Vercel.)
const FAILOVER_MODE = "front_door";       // ACTIVE now
// const FAILOVER_MODE = "dns_switch";   // <-- uncomment after domain purchase

// ─── Timers ───────────────────────────────────────────────────────────────────
// Public entry switches to type_2 when type_1's 1-minute pings go stale for
// more than STALE_SWITCH_MIN. It switches back once type_1 has pinged in an
// uninterrupted streak for RETURN_HYSTERESIS_MIN (prevents flapping).
const STALE_SWITCH_MIN      = parseInt(process.env.STALE_SWITCH_MIN || "3", 10);
const RETURN_HYSTERESIS_MIN = parseInt(process.env.RETURN_HYSTERESIS_MIN || "5", 10);

// A ping gap larger than this breaks the "uninterrupted streak".
const STREAK_GAP_MIN = parseInt(process.env.STREAK_GAP_MIN || "2", 10);

// How long a lambda instance may reuse the cached failover state / tunnel URL.
const STATE_CACHE_MS = parseInt(process.env.STATE_CACHE_MS || "15000", 10);

// Upstream fetch timeout for proxied requests (ms).
const PROXY_TIMEOUT_MS = parseInt(process.env.PROXY_TIMEOUT_MS || "55000", 10);

module.exports = {
  FAILOVER_MODE,
  STALE_SWITCH_MIN,
  RETURN_HYSTERESIS_MIN,
  STREAK_GAP_MIN,
  STATE_CACHE_MS,
  PROXY_TIMEOUT_MS,
};
