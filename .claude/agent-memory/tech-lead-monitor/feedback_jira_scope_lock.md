---
name: HARD RULE — Jira workspace is locked to edgedigital.atlassian.net
description: Critical safety rule — Jira writes must go through the edgejira MCP only (hardcoded to edgedigital), never the Rovo connector which can target other workspaces (e.g. TBC Bank's tbchq.atlassian.net)
type: feedback
---

**Hard rule:** Every Jira/Atlassian write in this project MUST go through the `edgejira` MCP server (tools prefixed `mcp__edgejira__*`). That server has `JIRA_URL=https://edgedigital.atlassian.net` baked in as an env var, so it cannot physically write anywhere else. NEVER fall back to the `claude.ai Atlassian Rovo` connector (`mcp__claude_ai_Atlassian_Rovo__*`) — its OAuth scope is account-wide and can target multiple workspaces, including `tbchq.atlassian.net` (TBC Bank, the user's separate employer, a completely different organization).

**Why:** Discovered 2026-04-25 during the first Jira MCP smoke test. An earlier OAuth handshake to Rovo had been completed as `tdzidzishvili@tbcbank.ge` instead of `nova@edge.ge`, and `getAccessibleAtlassianResources` returned only `tbchq.atlassian.net`. Had a create-issue call gone through, it would have landed in TBC Bank's Jira. The user stopped it in time and made the rule explicit: edgedigital is the only valid scope, and the safe channel is the dedicated `edgejira` MCP, not the OAuth-based Rovo connector.

**How to apply:**
1. **For every Jira write**, use `mcp__edgejira__jira_*` tools. The hardcoded `JIRA_URL` makes the workspace identity unforgeable from this side.
2. **Never use** `mcp__claude_ai_Atlassian_Rovo__*` tools, even if they look more convenient. They authenticate via account-wide OAuth and can hit the wrong workspace.
3. **If `edgejira` is not loaded** (no `mcp__edgejira__*` in the deferred tools list), STOP. Don't substitute Rovo. Tell the user the MCP is offline — the fix is to ensure `uvx` and the user-scope MCP entry in `~/.claude.json` are healthy (see `claude mcp get edgejira`). Restart Claude Code if the entry exists but the tools aren't loaded into the active session.
4. The bot account email for Jira writes is `nova@edge.ge`. The user (`tornike@edge.ge`) is mentioned only when explicit human input is required.
5. This rule overrides convenience. Even if Rovo would "just work" for a single call, do not use it — the workspace identity is part of the safety contract, not an implementation detail.

**Setup reference (current as of 2026-04-26):** `edgejira` is registered at user scope (`claude mcp add edgejira --scope user -- uvx mcp-atlassian`), env vars include `JIRA_URL=https://edgedigital.atlassian.net`, `JIRA_USERNAME=nova@edge.ge`, `JIRA_API_TOKEN=<token>`. Auto-attaches in every project on this machine.