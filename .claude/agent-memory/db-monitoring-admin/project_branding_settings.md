---
name: BrandingSettings model — EMS-5
description: Singleton BrandingSettings table added in migration 20260426110832; stores logo/favicon paths and platform name; permanent config, not in retention
type: project
---

Migration `20260426110832_add_branding_settings` adds the `BrandingSettings` singleton table (same pattern as `SmtpSettings`, `SmsSettings`, `AgentInstallSettings`).

Fields: `id`, `platformName` (default "Edge Monitor"), `logoPath?`, `logoMimeType?`, `faviconPath?`, `faviconMime?`, `updatedAt`.

**Why:** White-label branding initiative (EMS-5/EMS-6/EMS-9/EMS-11). Files live at `/data/branding/`; DB stores path + MIME only.

**How to apply:** This is permanent config — never add it to `dataRetention.ts`. The singleton row is created lazily by the backend on first write (EMS-6). `prisma.config.ts` controls the DB path; `DATABASE_URL` env var overrides the default (`file:../../data/edge-monitoring.db`) in production.
