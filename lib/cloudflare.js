/**
 * cloudflare.js — dns_switch mode only (DORMANT until the domain is
 * purchased; production_ready_plan_draft_v3 C8/5.3).
 *
 * Repoints the public hostname's CNAME between the two mains' FIXED named-
 * tunnel hostnames. Requires Vercel env:
 *   CF_API_TOKEN        zone-scoped token with DNS edit permission
 *   CF_ZONE_ID          the Cloudflare zone id of the domain
 *   PUBLIC_HOSTNAME     e.g. api.example.in  (what clients use)
 *   T1_TUNNEL_HOSTNAME  e.g. t1.example.in   (type_1's named tunnel)
 *   T2_TUNNEL_HOSTNAME  e.g. t2.example.in   (type_2's named tunnel)
 */

const CF_API = "https://api.cloudflare.com/client/v4";

function envOrThrow(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (required for dns_switch mode)`);
  return v;
}

async function cf(pathname, options = {}) {
  const token = envOrThrow("CF_API_TOKEN");
  const res = await fetch(`${CF_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await res.json();
  if (!res.ok || body.success === false) {
    throw new Error(`Cloudflare API ${pathname} failed: ${JSON.stringify(body.errors || body)}`);
  }
  return body;
}

/** Tunnel hostname of a main by role suffix ("type_1" | "type_2"). */
function tunnelHostnameFor(role) {
  return role === "main_server_type_1"
    ? envOrThrow("T1_TUNNEL_HOSTNAME")
    : envOrThrow("T2_TUNNEL_HOSTNAME");
}

/**
 * Point PUBLIC_HOSTNAME's CNAME at the given main's fixed tunnel hostname.
 * Proxied record -> the change is near-instant on Cloudflare's edge.
 */
async function switchDnsToRole(role) {
  const zoneId = envOrThrow("CF_ZONE_ID");
  const publicHost = envOrThrow("PUBLIC_HOSTNAME");
  const target = tunnelHostnameFor(role);

  const list = await cf(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(publicHost)}`
  );
  const record = list.result && list.result[0];
  if (!record) {
    throw new Error(`No CNAME record found for ${publicHost} in zone ${zoneId} — create it once manually`);
  }
  if (record.content === target) return { changed: false, target };

  await cf(`/zones/${zoneId}/dns_records/${record.id}`, {
    method: "PATCH",
    body: JSON.stringify({ content: target, proxied: true }),
  });
  return { changed: true, target };
}

module.exports = { switchDnsToRole };
