---
name: SSE Auth Bug — Reconnecting Badge
description: P1 bug where native EventSource cannot send Bearer headers, causing SSE stream to 401-loop and badge to show "Reconnecting" forever
type: project
---

ServerDetail SSE stream auth fails because native `EventSource` cannot send custom headers. Fix pattern chosen: short-lived single-use SSE ticket via `POST /servers/:id/stream-ticket` (in-memory, 60s TTL, bound to userId+serverId). Frontend fetches ticket first, then opens `EventSource` with `?ticket=` query param. Backend accepts ticket as alt-auth only on the stream route.

**Why:** RouteGuard classifies `/servers/*` as requireAuth, which mandates Bearer header. Native browser EventSource API has no header support — architectural mismatch, not a config error.

**How to apply:** Dispatch backend-monitoring-architect first (ticket endpoint + stream route guard bypass), then noc-dashboard-frontend (useEffect ticket fetch + reconnect logic). Sequential, not parallel — frontend depends on the new endpoint contract.
