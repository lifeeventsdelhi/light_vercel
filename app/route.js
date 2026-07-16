/**
 * Root-path front-door proxy ("/"). The [...path] catch-all does not match
 * the empty path, so the root is handled here.
 */

const { proxyRequest } = require("../lib/proxy");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request) {
  return proxyRequest(request, []);
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
