# Getting help

## Quick reference

| You want to… | Use… |
| --- | --- |
| Ask a question, share a setup, brainstorm a workflow | [GitHub Discussions](https://github.com/bdwalter/Obsidian-mcp/discussions) |
| Report a bug | [Open an issue](https://github.com/bdwalter/Obsidian-mcp/issues/new?template=bug_report.yml) |
| Suggest a feature or new tool | [Open an issue](https://github.com/bdwalter/Obsidian-mcp/issues/new?template=feature_request.yml) |
| Report a security vulnerability | [Private security advisory](https://github.com/bdwalter/Obsidian-mcp/security/advisories/new) — see `SECURITY.md` |
| Read the docs | [README](README.md) and [CONTRIBUTING](CONTRIBUTING.md) |

## Before you open an issue

A few things that will likely save round-trips:

1. **Plugin version and Obsidian version.** Get plugin version from Settings → Claude MCP footer, or call `get_server_info`. Obsidian version from About.
2. **Are you on the latest build?** Sometimes the answer is "rebuild, disable + re-enable the plugin, try again." The bundle is held in memory until reload.
3. **What does the developer console say?** `Cmd+Option+I` (macOS) → Console tab. Filter for `[claude-mcp]`.
4. **Can you reproduce without Claude in the loop?** `scripts/smoke.sh` and `scripts/release-qa.sh` exercise the MCP surface directly via curl — narrows whether the bug is in the plugin or the client.

## Triage expectations

This is a small, single-maintainer project. Issues and discussions are read but may not get same-day responses. PRs with tests get faster turnaround than open-ended discussions about future direction. Be patient and stay friendly — see `CODE_OF_CONDUCT.md`.
