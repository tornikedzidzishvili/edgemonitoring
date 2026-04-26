---
name: Agent tools allowlist must include mcp__* for MCP servers to be visible
description: Gotcha — even if MCP servers are connected globally, an agent's frontmatter tools allowlist filters them out unless mcp__* is listed
type: feedback
---

If an agent's frontmatter has an explicit `tools:` allowlist, MCP server tools (e.g. Atlassian/Jira, Figma, Google Drive) are **not** automatically inherited — they must be explicitly listed.

**Why:** Discovered 2026-04-25 while testing the Jira MCP connection. `claude mcp list` showed Atlassian Rovo as `✓ Connected` at the system level, but the tech-lead agent had no Jira tools available because its `tools:` allowlist did not include any MCP entry. Adding `mcp__*` to the end of the allowlist resolved it (after a Claude Code restart to reload the agent definition).

**How to apply:**
- When defining an agent that needs MCP access, **omit the `tools:` field entirely** so the agent inherits all tools. The `mcp__*` wildcard pattern in YAML frontmatter `tools:` was tested 2026-04-25 and did NOT cause MCP tools to be bound to the agent runtime — Claude Code may only honor wildcards for built-in tools (e.g. `Bash(git *)`), not for MCP prefixes.
- After editing an agent's frontmatter, the user must **restart Claude Code** — agent definitions are loaded at session start, not hot-reloaded. In VSCode: `Developer: Reload Window`.
- If you ever see "MCP server is connected per `claude mcp list` but tools aren't available," check the running agent's frontmatter `tools:` field first.
- The trade-off of omitting `tools:` is losing the explicit `Agent(...)` subagent allowlist. In practice this is fine because the project's `.claude/agents/` folder is the source of truth for who can be spawned.
