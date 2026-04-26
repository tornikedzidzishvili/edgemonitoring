---
name: Jira workspace + project for Edge Monitoring (verified 2026-04-25)
description: Atlassian workspace, project key, MCP server, statuses, transition IDs, and bot account for the EMS Jira integration
type: project
---

Edge Monitoring Jira coordinates — verified end-to-end via the `edgejira` MCP on 2026-04-25:

- **Workspace URL**: `https://edgedigital.atlassian.net`
- **Project key**: `EMS`  (numeric id `10099`, name "edge Monitoring System")
- **Project type**: team-managed (`style: next-gen, simplified: true`)
- **Board**: "EMS board" (id `67`, type `simple`/Kanban)
- **MCP server name**: `edgejira` (project-scoped via `.mcp.json`, runs sooperset/mcp-atlassian Docker image, hardcoded JIRA_URL to edgedigital). **Always use this**, never the `claude.ai Atlassian Rovo` connector — its OAuth scope cannot be locked.
- **Bot account (all writes happen as this user)**: `nova@edge.ge` — the agent system's "Scrum Master Nova" persona. Default assignee for every issue.
- **Human contact**: `tornike@edge.ge` — `@`-mention in a Jira comment **only** when explicit human input/approval is required. Default channel for everything else is the Claude Code chat.

### Workflow statuses (project-scoped status IDs)

| Status name | Status ID | Transition ID (from any status) | Category |
|---|---|---|---|
| To Do | 10108 | 11 | new (blue-gray) |
| Selected for Development | 10111 | 2 | indeterminate (yellow) |
| In Progress | 10109 | 21 | indeterminate (yellow) |
| Code Review | 10112 | 3 | indeterminate (yellow) |
| Done | 10110 | 31 | done (green) |

Transitions are **global** (any-to-any) in this team-managed workflow — verified by `jira_get_transitions` on EMS-2.

### MCP usage rules

1. **Pre-flight before every write session**: call `mcp__edgejira__jira_get_user_profile(user_identifier="nova@edge.ge")` and confirm result returns successfully. If it errors, the token has expired or the workspace is wrong — do NOT proceed.
2. **Comments and transitions are separate calls.** `jira_transition_issue`'s inline `comment` param requires Atlassian Document Format (ADF) and will fail with plain markdown. Always use `jira_add_comment` separately. They can run in parallel in the same message.
3. **No active sprints** (Kanban project). Skip the sprint field.
4. **Severity for bugs** goes in summary (`[P0]`/`[P1]`/...) or as a label, not as a built-in priority — the priority field defaults to `Medium`.

**Why:** This is the live status surface the user watches. The full 5-status round-trip was verified end-to-end on 2026-04-25 with EMS-2. Documented in [CLAUDE.md](../../CLAUDE.md) and [tech-lead-monitor.md](../../agents/tech-lead-monitor.md).

**How to apply:** Use the transition IDs above directly — no need to call `jira_get_transitions` first unless the workflow has been changed since 2026-04-25. If a transition fails with "transition not found," then re-fetch transitions and update this memory.
