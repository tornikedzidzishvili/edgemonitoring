---
name: Jira team-managed projects — REST API limits for workflow editing
description: For team-managed (next-gen) Jira projects, board column configuration is UI-only — don't waste cycles trying to add columns via REST
type: feedback
---

For Jira **team-managed** projects (`style: next-gen, simplified: true`), the public REST API is read-only for board column configuration. Don't try to add or remove columns via REST.

**What works via public REST (verified 2026-04-25 against edgedigital):**
- `POST /rest/api/3/statuses` with `scope.type=PROJECT, scope.project.id=<id>` — creates a project-scoped status. ✅
- `GET /rest/api/3/project/<key>/statuses` — lists current statuses per issue type.
- `GET /rest/agile/1.0/board/<id>/configuration` — read board columns + status mapping.
- All issue-level operations (create, transition, comment, search, link).

**What does NOT work via public REST for team-managed:**
- `PUT /rest/agile/1.0/board/<id>/configuration` — returns 405 / silently no-op for team-managed boards. The "simplified workflow" is editable via UI only.
- `GET /rest/api/3/workflow/search?projectId=<id>` — returns `total: 0` because team-managed projects don't expose their workflows via the company-managed workflow API.
- Adding a project-scoped status to a board column. Statuses can be created via REST, but wiring them into the board layout requires the UI.

**How to apply:**
- If the user wants to change a team-managed project's columns or workflow, give them step-by-step UI clicks (Project → Board → `···` menu → Configure board → Columns → `+ Add column`). Don't try to script it.
- If the user has admin and wants to do something that needs new statuses, you CAN create the status objects via REST (saves them clicks for naming/categorizing). Then they only have to do the column add+drag.
- Never try internal Atlassian endpoints (`/rest/internal/...` or `/gateway/...`) on a production Jira — they're undocumented and may corrupt the workflow.
