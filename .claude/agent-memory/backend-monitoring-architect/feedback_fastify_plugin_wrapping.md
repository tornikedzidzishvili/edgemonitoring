---
name: Fastify cross-cutting plugins must use fp() wrapping
description: Any plugin that registers hooks (auth guard, rate limiter) intended to apply globally MUST be wrapped with fastify-plugin; plain async plugins are encapsulated
type: feedback
---

Any Fastify plugin that registers cross-cutting hooks (onRequest, onSend, etc.) must be wrapped with `fp()` from `fastify-plugin`. Plain async functions passed to `app.register()` create an encapsulated child context — hooks registered inside only fire for routes in that same context, not for sibling plugins.

This caused a P0 security regression (commit 5031aba → fixed bfc131f) where `routeGuardPlugin` and `rateLimiterPlugin` were both encapsulated, meaning every route plugin registered as a sibling on the root app bypassed auth enforcement and rate limiting entirely.

**Why:** Fastify encapsulation is a deliberate isolation feature. fp() explicitly opts out of it. Without fp(), even correctly-written guard logic is silently never called.

**How to apply:** Whenever adding or reviewing a plugin that calls `app.addHook()` for a hook that should apply app-wide, confirm it is exported via `fp(impl, { name, fastify })`. The inner implementation function must have a different name than the exported const to avoid TypeScript duplicate identifier errors (e.g., `routeGuardPluginImpl` → `export const routeGuardPlugin = fp(routeGuardPluginImpl, ...)`).
