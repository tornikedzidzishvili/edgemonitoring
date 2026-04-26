---
name: Registry Credentials Section
description: New settings tab for container registry credentials (GHCR/docker pull auth) added alongside SMTP/SMS/etc in Settings.tsx
type: project
---

`RegistryCredentialsSection` component added at `apps/web/src/components/settings/RegistryCredentialsSection.tsx`.

New tab `"registry"` added to Settings.tsx tab list.

API types `AgentInstallSettingsResponse` and methods `agentInstallSettings()` / `saveAgentInstallSettings()` added to `apps/web/src/lib/api.ts`.

**Why:** Agent image is in a private GHCR registry; docker pull on customer servers fails without credentials. Credentials are write-only — token never returned by GET, never displayed after save, token input is always cleared post-save.

**How to apply:** When touching agent install flow or registry auth, the Settings "Registry" tab is the single source of truth for these credentials. The token is a write-only field by design — do not add any read-back of the token value.
