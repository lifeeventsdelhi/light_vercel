/**
 * proxy.js — front_door reverse proxy core.
 * (production_ready_plan_draft_v3 C8/A1: "client sees my vercel url and
 *  vercel internally redirects the request")
 *
 * Streams the incoming request to the active main's LATEST quick-tunnel URL
 * and streams the response back. The tunnel URL is NEVER exposed to the
 * client. Big binaries (bill PDFs) are served from R2 public URLs by the
 * app itself, so they do not cross this proxy.
 */

const { getProxyTarget, invalidateProxyCache } = require("./state");
const config = require("./config");

// Headers that must not be forwarded in either direction.
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
]);

// fetch() decompresses upstream bodies; forwarding these would corrupt the
// response the client sees.
const STRIP_RESPONSE = new Set(["content-encoding", "content-length", ...HOP_BY_HOP]);

function buildForwardHeaders(request) {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!HOP_BY_HOP.has(name.toLowerCase())) headers.set(name, value);
  });
  const url = new URL(request.url);
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", "https");
  if (!headers.get("x-forwarded-for")) {
    const clientIp = headers.get("x-real-ip") || headers.get("cf-connecting-ip");
    if (clientIp) headers.set("x-forwarded-for", clientIp);
  }
  return headers;
}

async function proxyRequest(request, pathSegments = []) {
  if (config.FAILOVER_MODE !== "front_door") {
    return Response.json(
      { error: "front door disabled — dns_switch mode is active, use the public hostname" },
      { status: 404 }
    );
  }

  const target = await getProxyTarget();
  if (!target) {
    return Response.json(
      { error: "upstream down", detail: "no active main with a known tunnel URL" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const path = pathSegments.map(encodeURIComponent).join("/");
  const upstreamUrl = `${target.tunnelUrl}/${path}${url.search}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.PROXY_TIMEOUT_MS);

  const init = {
    method: request.method,
    headers: buildForwardHeaders(request),
    redirect: "manual",
    signal: controller.signal,
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch (err) {
    clearTimeout(timer);
    invalidateProxyCache();
    console.error(`[front-door] upstream ${target.activeMain} failed: ${err.message}`);
    return Response.json(
      { error: "upstream down", active_main: target.activeMain, detail: String(err.message) },
      { status: 503 }
    );
  }
  clearTimeout(timer);

  const respHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (STRIP_RESPONSE.has(name.toLowerCase())) return;
    if (name.toLowerCase() === "location") {
      try {
        const location = new URL(value, target.tunnelUrl);
        if (location.origin === new URL(target.tunnelUrl).origin) {
          location.protocol = url.protocol;
          location.host = url.host;
          value = location.toString();
        }
      } catch {
        // Relative/invalid locations are safe to forward unchanged.
      }
    }
    respHeaders.append(name, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

module.exports = { proxyRequest };
