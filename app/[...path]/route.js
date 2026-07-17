/**
 * Catch-all front-door proxy. proxyRequest blocks the private /servers and
 * /cluster trees and forwards every other path to the active main.
 * (production_ready_plan_draft_v3 C8/A1)
 */

const { proxyRequest } = require("../../lib/proxy");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request, { params }) {
  const resolvedParams = await params;
  const segments = Array.isArray(resolvedParams?.path) ? resolvedParams.path : [];
  return proxyRequest(request, segments);
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};
