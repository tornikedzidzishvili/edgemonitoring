---
name: Ops-only scope: halt and escalate on code regressions found during ops runs
description: When running an ops playbook (deploy verify, VACUUM, etc.), if a security or correctness bug in shipped code is discovered, stop and report rather than continuing the ops plan or editing files.
type: feedback
---

When executing an ops playbook (monitor deploy, run VACUUM, rotate certs, etc.), scope is strictly operations — not code fixes.

**Why:** The playbook's preconditions (a healthy, correct deploy) implicitly gate the ops steps that follow. If the deploy shipped a regression — especially a security one — running the follow-up ops step (e.g. a long write-blocking VACUUM while an admin endpoint is leaking DB internals) compounds risk instead of reducing it. Fixing code under ops scope also violates the agent-team routing contract; code changes belong to the owning specialist (backend / db / frontend), dispatched by the tech lead.

**How to apply:**
- Finish the verification portion that's safe (confirm workflows green, confirm API is at minimum responsive).
- If a shipped regression is found, halt before destructive/long-running ops (VACUUM, migrations, restarts that invalidate caches) and surface it in the report with: what you observed, evidence (exact curl / log snippets), and a recommendation on which specialist should own the fix.
- Do not edit committed files in an ops pass, even to "quickly patch" — create a PR via the correct specialist instead.
- Bias toward reporting with raw evidence rather than diagnosing root cause; the tech lead will route it.
