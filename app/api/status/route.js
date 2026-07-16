/**
 * GET /api/status — watchdog + fleet failover status (JSON).
 * (production_ready_plan_draft_v3 C8)
 *
 * If STATUS_TOKEN is set in the Vercel env, requests must send
 * Authorization: Bearer <STATUS_TOKEN>. Without a configured token the
 * endpoint remains open but tunnel URLs are redacted.
 */

import { NextResponse } from "next/server";

const state = require("../../../lib/state");
const config = require("../../../lib/config");
const { sql } = require("../../../lib/db");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const token = process.env.STATUS_TOKEN || "";
  const auth = request.headers.get("authorization") || "";
  const canSeeTunnelUrls = Boolean(token) && auth === `Bearer ${token}`;
  if (token) {
    if (!canSeeTunnelUrls) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const [failover, mains, leaseRows] = await Promise.all([
    state.getFailoverState(),
    state.loadMains(),
    sql`SELECT leader_server_id, lease_until, promoted_at,
               (lease_until > now()) AS lease_live
          FROM cluster_leader WHERE singleton = 1`,
  ]);

  const describe = (m) =>
    m && {
      server_id: m.server_id,
      status: m.status,
      tunnel_url: canSeeTunnelUrls ? (m.cloudflare_tunnel_address || null) : undefined,
      last_ping_at: m.pinged_at,
      ping_age_min: m.ping_age_min === null ? null : Number(Number(m.ping_age_min).toFixed(2)),
      ping_streak_min: m.streak_min === null ? null : Number(Number(m.streak_min).toFixed(2)),
    };

  return NextResponse.json({
    mode: config.FAILOVER_MODE,
    tunnel_urls_redacted: !canSeeTunnelUrls,
    thresholds: {
      switch_after_min: config.STALE_SWITCH_MIN,
      return_hysteresis_min: config.RETURN_HYSTERESIS_MIN,
    },
    failover_state: failover,
    cluster_leader: leaseRows[0] || null,
    type_1: describe(mains.type1),
    type_2: describe(mains.type2),
    now: new Date().toISOString(),
  });
}
