---
name: Server availability buckets must use offline alert history, not just report presence
description: Per-server uptime bars on ServersDashboard must derive downtime from ServerAlert history (all statuses) — report-presence alone is insufficient and collapses to 100% after alert resolution
type: feedback
---

Availability buckets for `GET /servers/dashboard` must be computed from BOTH `ServerReport` presence AND `offline` type `ServerAlert` history (including resolved alerts). Using only `ServerReport` presence caused historical downtime windows to disappear once the server came back online (all recent buckets turn green), making it look like 100% uptime.

**Why:** A server that was offline for 30 minutes has no `ServerReport` records for that period. Once it comes back online and recent reports fill the 12h window, the earlier empty buckets can visually "shift" to look like downtime is gone. Using offline alert windows `[triggeredAt, resolvedAt ?? now]` gives an immutable historical record — resolving the alert does NOT alter past values.

**How to apply:** When computing per-server uptime bars (or any server availability percentage):
1. Fetch `ServerAlert` rows with `type: "offline"` — NO `status: "active"` filter for historical windows.
2. Each alert contributes a downtime interval `[triggeredAt, resolvedAt ?? now]`.
3. Mark a bucket as down if any offline alert window overlaps it (takes priority over report presence).
4. Fall back to `ServerReport` presence only for buckets not covered by any alert window.
5. Add the comment: `// Historical downtime: includes resolved alerts. Do not add status:"active" filter — see EMS bug repro: resolving alerts collapsed chart to 100%.`
