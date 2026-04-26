---
name: Dead Code — SMTP Test Stub
description: /settings/smtp/test route (settings.ts lines 101-120) is a stub that returns "would be sent" — the real test endpoint is /settings/alerts/test. Should be removed.
type: project
---

`POST /settings/smtp/test` at `apps/api/src/routes/settings.ts` lines 101-120 is a dead-code stub that returns a hardcoded "would be sent" message. It was never wired to nodemailer.

The real working test-email endpoint is `POST /settings/alerts/test` which calls `sendTestAlerts()`.

**Why:** Noticed during planning for the branding/email initiative on 2026-04-26. Tech lead confirmed as dead code to clean up.
**How to apply:** Schedule removal as part of the BRD-2/BRD-3 backend story (same file, low risk). Do not treat this stub as a test harness — it does nothing.