---
name: Branding Settings Component
description: BrandingSettings tab added to Settings page — covers patterns for multipart FormData uploads, inline status banners, and per-section independent save actions
type: project
---

BrandingSettings.tsx added at `apps/web/src/components/settings/BrandingSettings.tsx`. It is the 9th tab in `apps/web/src/pages/Settings.tsx` (tab id `"branding"`).

Key patterns established here:
- **Multipart upload via native fetch + FormData**: do NOT set Content-Type header; browser sets it with boundary. Auth header injected separately via `authHeaders()` (local helper duplicating the TOKEN_KEY pattern from api.ts — `getAuthHeaders` is not exported from api.ts).
- **Three independent save sections**: platformName (text input + Save), logo (file picker + Upload + Remove), favicon (same). Each has its own `AssetStatus` state `{ error, success, loading }`.
- **Cache-busting logo/favicon `<img>` src**: `${API_BASE_URL}${branding.logoUrl}?t=${new Date(branding.updatedAt).getTime()}`.
- **No toast library**: inline Framer Motion animated banners (`StatusBanner`) matching the pattern in SmtpSettings and RegistryCredentialsSection.
- **Client-side size validation** on file change: inline `neon-rose` error text below the file input; Upload button disabled when `logoSizeError` or `faviconSizeError` is non-empty.
- **Why:** EMS-9 / BRD-5. Backend branding API shipped in EMS-6 (`GET/PUT /api/settings/branding`, `DELETE /api/settings/branding/logo`, `DELETE /api/settings/branding/favicon`).
- **How to apply:** If expanding branding (e.g. dark/light logo variants), follow the same per-asset section pattern with its own status state. If api.ts exports `getAuthHeaders` in the future, replace the local `authHeaders()` copy.
