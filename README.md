# small-server watchdog (Vercel front door + failover)

Public entry point + failover watchdog for the fleet
(production_ready_plan_draft_v3 section C8).

## What it does

- **front_door mode (ACTIVE now, no domain needed):** this app's URL
  (`https://<app>.vercel.app`) is the one stable public URL. Every request is
  **proxied** server-side to the current active main's latest Cloudflare
  quick-tunnel URL (read from the shared Neon `servers` table, kept fresh by
  heartbeats + tunnel self-heal). Clients never see the tunnel URL.
- **dns_switch mode (dormant until the domain is purchased):** the public
  hostname's CNAME is repointed between the two mains' fixed named-tunnel
  hostnames via the Cloudflare API. Flip the comment in `lib/config.js`
  (or set `FAILOVER_MODE=dns_switch` in the Vercel env).
- `/api/ping` — 1-minute liveness pings from the two mains
  (`scripts/watchdog_ping.sh`). Every ping evaluates the failover rules:
  - type_1 pings stale **> 3 min** → switch active_main to type_2
  - type_1 back with an uninterrupted **5 min** ping streak → switch back
- `/api/status` — JSON status (mode, active_main, ping ages, cluster leader).
  Set `STATUS_TOKEN` to require `Authorization: Bearer <token>`.

## Deploy

1. Create a Vercel project from this `vercel/` folder
   (`cd vercel && npx vercel`, or import via the dashboard with root
   directory = `vercel`).
2. Project env vars (Production):
   - `DATABASE_URL` — the SAME Neon pooled connection string the fleet uses
   - `STATUS_TOKEN` — optional, protects `/api/status`
3. Deploy. Set `WATCHDOG_URL=https://<app>.vercel.app` in the two mains'
   `.env` (install.sh prompts for it) so their 1-minute ping cron flows.
4. Point API clients at `https://<app>.vercel.app` — this URL never changes.

## After the domain is purchased (dns_switch)

1. Add the zone to Cloudflare; create named tunnels on both mains and give
   them fixed hostnames (`t1.<domain>`, `t2.<domain>`); create the public
   CNAME (`api.<domain>` → `t1.<domain>`, proxied) once manually.
2. Add Vercel env: `CF_API_TOKEN` (zone DNS edit), `CF_ZONE_ID`,
   `PUBLIC_HOSTNAME`, `T1_TUNNEL_HOSTNAME`, `T2_TUNNEL_HOSTNAME`.
3. In `lib/config.js` comment the `front_door` line and uncomment
   `dns_switch` (or set `FAILOVER_MODE=dns_switch` env var). Redeploy.
4. Migrate clients to `https://api.<domain>` (one-time change).

## Manual failover (if Vercel or the watchdog is down)

The pipeline keeps running — only automatic public-entry failover stops.
Force the state by SQL against Neon:

```sql
UPDATE failover_state SET active_main = '<server_id>', switched_at = now(),
       reason = 'manual failover' WHERE singleton = 1;
```

In dns_switch mode, repoint the CNAME directly:

```bash
curl -X PATCH "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
  -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"content":"t2.example.in","proxied":true}'
```
