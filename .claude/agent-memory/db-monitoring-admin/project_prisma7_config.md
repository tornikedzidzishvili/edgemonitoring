---
name: Prisma 7 migration config
description: Prisma 7 requires prisma.config.ts for migrate commands — datasource url no longer lives in schema.prisma
type: project
---

Prisma 7 removed `url` from the `datasource` block in `schema.prisma`. Migration commands require a `prisma.config.ts` at the app root that passes the URL via `defineConfig({ datasource: { url: ... } })`.

**Why:** Prisma 7 separated client config (driver adapter in `PrismaClient` constructor) from migration config (`prisma.config.ts`). The schema datasource block only carries `provider`.

**How to apply:** When running `prisma migrate dev/deploy/diff`, the `prisma.config.ts` file at `apps/api/prisma.config.ts` must exist and export a `defineConfig` with `datasource.url` reading from `DATABASE_URL` env var. The `db.ts` PrismaClient still uses `@prisma/adapter-libsql` at runtime — those are separate concerns.
