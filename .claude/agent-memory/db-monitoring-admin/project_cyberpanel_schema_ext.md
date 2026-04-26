---
name: CyberPanel SharedHostingServer schema extension — EMS-21
description: Wave 4 Phase 2 schema: SSH fields on SharedHostingServer, serviceStatus on SharedHostingDomain, SshKey back-relation; migration 20260426194718
type: project
---

EMS-21 added CyberPanel support by extending existing models (additive only, no new model):

**SharedHostingServer** — three nullable SSH fields added:
- `sshKeyId String?` (FK → SshKey with SET NULL)
- `sshUser  String?`
- `sshPort  Int?`
- `type` kept as String; doc comment now lists `"plesk" | "manual" | "cyberpanel"`. Decision (A) was chosen deliberately — no enum migration risk; Zod validates at application layer in EMS-22/24.

**SshKey** — back-relation `sharedHostingServers SharedHostingServer[]` added.

**SharedHostingDomain** — one new nullable field:
- `serviceStatus String?` (JSON blob: `{ lscpd, lsws, mariadb: "active"|"inactive" }`)
- `sslExpiresAt` was NOT re-added (already existed at line 277 since the original plesk migration).

Migration: `20260426194718_add_cyberpanel_shared_hosting`
- `SharedHostingDomain`: simple `ALTER TABLE ... ADD COLUMN "serviceStatus" TEXT`
- `SharedHostingServer`: shadow-table redefine (CREATE new_* / INSERT SELECT all old columns / DROP / RENAME). All existing Plesk/manual rows preserved — INSERT SELECT explicitly lists only old columns, new SSH fields default to NULL.

**Why:** dataRetention.ts is unaffected — it only filters on `checkedAt`/`reportedAt`/`minuteStart`/`resolvedAt`. No retention logic needed for SharedHostingServer or SharedHostingDomain config rows.

**Reversibility:** Drop `sshKeyId`, `sshUser`, `sshPort` from `SharedHostingServer` and `serviceStatus` from `SharedHostingDomain` (requires another shadow-table redefine for SharedHostingServer due to FK removal; SharedHostingDomain is a simple column drop via ALTER TABLE).
