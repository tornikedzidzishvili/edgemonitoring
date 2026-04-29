---
name: sshHost field on SharedHostingServer — EMS-31
description: Nullable sshHost String? added to SharedHostingServer to fix missing-ssh-config scheduler errors; migration 20260426205034
type: project
---

`sshHost String?` added to `SharedHostingServer` adjacent to the other SSH fields (`sshKeyId`, `sshUser`, `sshPort`). Previously CyberPanel had no dedicated host column, causing every scheduler cycle to log `missing-ssh-config` and never connect.

Migration: `20260426205034_add_shared_hosting_ssh_host` — pure `ALTER TABLE "SharedHostingServer" ADD COLUMN "sshHost" TEXT;`. No shadow-table rewrite; SQLite accepted the straight ADD COLUMN because the field is nullable with no computed default.

**Why:** P1 production bug on EMS-14 epic; Wave A (schema only) unblocks Wave B (backend + frontend wiring).

**How to apply:** When reading or writing CyberPanel SSH connection details, use `sshHost` as the dedicated host field — do not overload `apiUrl` for SSH host resolution.
