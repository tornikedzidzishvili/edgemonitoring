---
name: API path prefix via nginx
description: Public URL for Fastify API routes is /api/* — nginx strips the /api prefix before proxying; bare /health on the public host hits the SPA, not the API.
type: reference
---

Public routing for `monitoring.edge.ge` (see `infra/proxy/nginx.https.conf`):

- `location /api/` proxies to `http://api:4000/` and **strips** `/api` via `proxy_pass http://api:4000/;` (trailing slash). So Fastify sees `/health`, `/admin/db/health`, etc.
- `location /` proxies to the web container, which serves the SPA and falls back to `index.html` for unknown paths.

Consequences for ops probes:

- Public liveness: `curl https://monitoring.edge.ge/api/health` → `{"ok":true}`. **Not** `/health` — that returns the SPA index.html with 200 and will silently mask API outages.
- Admin-guarded API routes: `https://monitoring.edge.ge/api/admin/...`, not `/admin/...`.
- Any curl against a path that isn't under `/api/` and isn't an SPA asset returns `index.html` with 200 OK. Assume 200 alone proves nothing for API health — check `Content-Type: application/json` or the body.
