/**
 * POST /api/ping — 1-minute liveness ping from the two MAIN servers.
 * (production_ready_plan_draft_v3 C8; sender: scripts/watchdog_ping.sh)
 *
 * Body: { "server_id": "...", "key": "..." }
 *   1. verify (server_id, key) against the servers registry
 *   2. upsert server_pings (maintains the uninterrupted-streak start)
 *   3. evaluate the failover rules (3-min switch / 5-min switch-back)
 */

import { NextResponse } from "next/server";

const state = require("../../../lib/state");
const config = require("../../../lib/config");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const serverId = String(body.server_id || "").trim();
  const key = String(body.key || "").trim();
  if (!serverId || !key) {
    return NextResponse.json({ error: "server_id and key are required" }, { status: 400 });
  }

  const server = await state.verifyServer(serverId, key);
  if (!server) {
    console.warn(`[watchdog] rejected ping from '${serverId}' (unknown/disabled/bad key)`);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await state.recordPing(serverId);

  let activeMain = null;
  try {
    activeMain = await state.evaluate(server.role);
  } catch (err) {
    console.error(`[watchdog] evaluate failed: ${err.message}`);
  }

  return NextResponse.json({
    status: "ok",
    mode: config.FAILOVER_MODE,
    active_main: activeMain,
  });
}
