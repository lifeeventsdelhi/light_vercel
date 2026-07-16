/**
 * state.js — failover state + switch evaluation.
 * (production_ready_plan_draft_v3 C8)
 *
 * Evaluation runs ON EVERY PING (no Vercel cron needed — type_2's own
 * 1-minute pings drive the check while type_1 is down):
 *
 *   ping from type_2:  active==type_1 AND type_1's ping stale > 3 min
 *                      -> switch active_main to type_2
 *   ping from type_1:  active==type_2 AND type_1's uninterrupted ping streak
 *                      >= 5 min -> switch back to type_1
 *
 * "switch" = UPDATE failover_state (front_door mode reads it per request);
 * in dns_switch mode it ALSO repoints the public CNAME via lib/cloudflare.
 */

const { sql } = require("./db");
const config = require("./config");

let _cache = { at: 0, state: null };

/** Record a ping, maintaining the uninterrupted-streak start. */
async function recordPing(serverId) {
  await sql`
    INSERT INTO server_pings (server_id, pinged_at, streak_started_at)
    VALUES (${serverId}, now(), now())
    ON CONFLICT (server_id) DO UPDATE SET
      streak_started_at = CASE
        WHEN server_pings.pinged_at > now() - make_interval(mins => ${config.STREAK_GAP_MIN})
        THEN server_pings.streak_started_at
        ELSE now()
      END,
      pinged_at = now()`;
}

/** Verify (server_id, key) against the registry. Returns the row or null. */
async function verifyServer(serverId, key) {
  const rows = await sql`
    SELECT server_id, role, status, cloudflare_tunnel_address
      FROM servers
     WHERE server_id = ${serverId} AND key = ${key} AND status <> 'disabled'`;
  return rows[0] || null;
}

/** The two mains + their latest pings + tunnel URLs. */
async function loadMains() {
  const rows = await sql`
    SELECT s.server_id, s.role, s.status, s.cloudflare_tunnel_address,
           p.pinged_at, p.streak_started_at,
           EXTRACT(EPOCH FROM (now() - p.pinged_at)) / 60          AS ping_age_min,
           EXTRACT(EPOCH FROM (now() - p.streak_started_at)) / 60  AS streak_min
      FROM servers s
      LEFT JOIN server_pings p ON p.server_id = s.server_id
     WHERE s.role IN ('main_server_type_1', 'main_server_type_2')
       AND s.status <> 'disabled'
     ORDER BY s.role`;
  return {
    type1: rows.find((r) => r.role === "main_server_type_1") || null,
    type2: rows.find((r) => r.role === "main_server_type_2") || null,
  };
}

async function getFailoverState() {
  const rows = await sql`SELECT active_main, switched_at, reason FROM failover_state WHERE singleton = 1`;
  return rows[0] || null;
}

async function setActiveMain(serverId, reason) {
  await sql`
    INSERT INTO failover_state (singleton, active_main, switched_at, reason)
    VALUES (1, ${serverId}, now(), ${reason})
    ON CONFLICT (singleton) DO UPDATE SET
      active_main = EXCLUDED.active_main,
      switched_at = now(),
      reason      = EXCLUDED.reason`;
  _cache = { at: 0, state: null };
}

async function performSwitch(target, reason) {
  await setActiveMain(target.server_id, reason);
  if (config.FAILOVER_MODE === "dns_switch") {
    const { switchDnsToRole } = require("./cloudflare");
    await switchDnsToRole(target.role);
  }
  console.log(`[watchdog] SWITCH active_main -> ${target.server_id} (${reason})`);
}

/**
 * Evaluate the failover rules. Called on every /api/ping.
 * Returns the current active_main server_id (after any switch).
 */
async function evaluate(pingerRole) {
  const { type1, type2 } = await loadMains();
  let state = await getFailoverState();

  // First contact: initialise pointing at type_1 if known, else the pinger.
  if (!state) {
    const initial = type1 || type2;
    if (initial) {
      await setActiveMain(initial.server_id, "initial");
      state = await getFailoverState();
    }
  }
  if (!state) return null;

  const t1Stale =
    !type1 || type1.ping_age_min === null || Number(type1.ping_age_min) > config.STALE_SWITCH_MIN;

  if (
    pingerRole === "main_server_type_2" &&
    type2 &&
    type1 &&
    state.active_main === type1.server_id &&
    t1Stale
  ) {
    await performSwitch(
      type2,
      `type_1 ping stale > ${config.STALE_SWITCH_MIN} min (age=${type1.ping_age_min === null ? "never" : Number(type1.ping_age_min).toFixed(1)})`
    );
    return type2.server_id;
  }

  if (
    pingerRole === "main_server_type_1" &&
    type1 &&
    type2 &&
    state.active_main === type2.server_id &&
    !t1Stale &&
    Number(type1.streak_min) >= config.RETURN_HYSTERESIS_MIN
  ) {
    await performSwitch(
      type1,
      `type_1 back — uninterrupted pings for ${Number(type1.streak_min).toFixed(1)} min`
    );
    return type1.server_id;
  }

  return state.active_main;
}

/**
 * front_door proxy target: the active main's LATEST quick-tunnel URL
 * (kept fresh by heartbeats + tunnel self-heal). Cached ~15 s per instance.
 */
async function getProxyTarget() {
  const now = Date.now();
  if (_cache.state && now - _cache.at < config.STATE_CACHE_MS) return _cache.state;

  const state = await getFailoverState();
  let target = null;

  if (state) {
    const rows = await sql`
      SELECT server_id, cloudflare_tunnel_address
        FROM servers WHERE server_id = ${state.active_main}`;
    if (rows[0] && rows[0].cloudflare_tunnel_address) {
      target = {
        activeMain: rows[0].server_id,
        tunnelUrl: String(rows[0].cloudflare_tunnel_address).replace(/\/+$/, ""),
      };
    }
  }

  // Fallback: any online main with a tunnel URL (state row missing/stale).
  if (!target) {
    const rows = await sql`
      SELECT server_id, cloudflare_tunnel_address
        FROM servers
       WHERE role IN ('main_server_type_1', 'main_server_type_2')
         AND status = 'online'
         AND COALESCE(cloudflare_tunnel_address, '') <> ''
       ORDER BY role
       LIMIT 1`;
    if (rows[0]) {
      target = {
        activeMain: rows[0].server_id,
        tunnelUrl: String(rows[0].cloudflare_tunnel_address).replace(/\/+$/, ""),
      };
    }
  }

  _cache = { at: now, state: target };
  return target;
}

module.exports = {
  recordPing,
  verifyServer,
  loadMains,
  getFailoverState,
  setActiveMain,
  evaluate,
  getProxyTarget,
};
