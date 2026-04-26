---
name: Branding + Email Templates Initiative
description: Multi-sprint initiative for react-email templates and white-label branding (logo/favicon upload, PWA manifest, dashboard chrome). Planned 2026-04-26.
type: project
---

Full white-label branding initiative scoped and planned on 2026-04-26. Comprises 8 stories across all four specialists.

**Key decisions locked by tech lead:**
- Email library: react-email (@react-email/components + @react-email/render)
- Branding assets: filesystem under existing `api_data` Docker volume at `/data/branding/`
- Asset access: branding READ endpoints (logo, favicon) classified PUBLIC in routeGuard; WRITE endpoints stay admin-only
- Logo URL in emails: absolute HTTPS URL pointing to public API endpoint (not base64 inline)
- Text fallback: react-email render({ plainText: true }) must stay working
- Default fallback: existing EdgeMonitor wordmark / lightning bolt if no logo uploaded
- PWA manifest: new Fastify route emitting dynamic JSON (no static file — index.html has no manifest link today, no public/ dir exists)
- Dead code: /settings/smtp/test stub (lines 101-120 in settings.ts) to be removed during backend story

**Story IDs (for Jira EMS issues):**
- BRD-1: BrandingSettings schema migration (db-monitoring-admin) — must be FIRST
- BRD-2: Branding asset upload + public read API (backend-monitoring-architect) — depends BRD-1
- BRD-3: react-email template refactor (backend-monitoring-architect) — can parallel BRD-2
- BRD-4: Wiring branding into email templates (backend-monitoring-architect) — depends BRD-2 + BRD-3
- BRD-5: Branding settings UI tab (noc-dashboard-frontend) — depends BRD-2 API contract
- BRD-6: White-label dashboard chrome (noc-dashboard-frontend) — depends BRD-2
- BRD-7: Dynamic PWA manifest route (backend-monitoring-architect) — depends BRD-2
- BRD-8: Docker volume + static-file serve config (enterprise-devops-engineer) — depends BRD-1, parallel with BRD-2

**Why:** Customer-facing white-label requirement; improve email professionalism with react-email.
**How to apply:** When planning follow-on work or sizing similar initiatives, use this as reference. Branding endpoints always need the public/admin split in routeGuard.