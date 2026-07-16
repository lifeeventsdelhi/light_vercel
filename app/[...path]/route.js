/**
 * Catch-all front-door proxy. proxyRequest enforces the public client-API
 * allowlist; operational paths such as /servers are never forwarded.
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
