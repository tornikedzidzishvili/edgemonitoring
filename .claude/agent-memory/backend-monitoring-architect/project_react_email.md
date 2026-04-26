---
name: react-email setup in apps/api
description: How react-email is wired into the alerting pipeline; versions, render API, JSX config
type: project
---

EMS-7 added react-email to `apps/api` for server-side HTML email rendering.

**Installed versions (2026-04-26):**
- `@react-email/components@1.0.12`
- `@react-email/render@2.0.7`
- `react@19.2.5`
- `react-dom@19.2.5`

**Key design decisions:**
- `apps/api/tsconfig.json` has `"jsx": "react-jsx"` and `"jsxImportSource": "react"` — automatic JSX transform, no `import React` needed in .tsx files (compiler injects it)
- `emailTemplates.tsx` exports three components: `WebAppDownEmail`, `ServerAlertEmail`, `TestNotificationEmail`
- `alerts.ts` was renamed to `alerts.tsx` to allow JSX at the render call sites
- `render()` is async (Promise<string>) in @react-email/render v2 — all call sites must await
- `render(component, { plainText: true })` generates the plaintext body — replaces `renderTemplate(template.emailBody, vars)`
- `AlertTemplate.emailBody` DB field is preserved for backward compat but no longer read for plaintext
- `AlertTemplate.emailSubject` is still used for the subject line via `renderTemplate()`
- Branding props (`brandingLogoUrl?`, `platformName?`) are exposed on all three components but not yet wired — EMS-8 does the wiring from BrandingSettings DB model

**How to apply:** When modifying alert emails or adding new templates, work in `apps/api/src/emailTemplates.tsx`. The `C` color palette at the top is the single source of truth for the dark NOC theme colors.
