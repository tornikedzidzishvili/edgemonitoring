---
name: Edge Monitoring API Stack
description: Core tech stack, module system, and plugin conventions for the Edge Monitoring API
type: project
---

Node.js/Fastify 5 API in TypeScript. ESM modules (`"type": "module"`), `module: ES2022`, `moduleResolution: Bundler` — all internal imports use `.js` extensions.

**Why:** Standard ESM setup; Bundler resolution allows extensionless imports at source but `.js` is used consistently in this project.
**How to apply:** Always use `.js` in import paths. Do not introduce CJS-style requires.

Key dependencies: fastify 5, @fastify/cors, @fastify/sensible, prisma 6, zod, undici, ssh2, nodemailer.
No fastify-plugin package — route modules are plain `async function(app: FastifyInstance)` registered via `app.register()`.

Auth middleware lives at `src/middleware/sessionAuth.ts` — exports `requireAuth`, `requireAdmin`, `optionalAuth`.
Legacy `requireAdmin` in `src/auth.ts` uses `x-admin-key` header — NOT used for user-session flows.

Plugins directory created at `src/plugins/` — `routeGuard.ts` and `rateLimiter.ts` registered there.
