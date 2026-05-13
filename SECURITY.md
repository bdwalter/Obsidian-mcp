# Security Policy

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private vulnerability reporting:

→ [Report a vulnerability privately](https://github.com/bdwalter/Obsidian-mcp/security/advisories/new)

If that link doesn't work (private vulnerability reporting may not be enabled), open a public issue titled "Security report — please contact me" with no details, and the maintainer will reach out via the email on the GitHub profile.

## What to include

A complete report typically has:

- A description of the issue and its impact (what an attacker can do)
- Repro steps or a proof-of-concept
- Plugin version and Obsidian version
- Whether the issue is exploitable with the default settings (`127.0.0.1` bind, bearer token required) or only under specific configurations
- Any mitigations or workarounds you've identified

## Threat model

The plugin assumes a single-user, local-only deployment:

- The bearer token is the only access control. Anyone with the token can use any registered tool.
- The server is bound to `127.0.0.1` by default. Binding to `0.0.0.0` is supported but is the user's deliberate choice.
- Loopback is shared with every other process running as your user; we don't try to gate which local process can hit the endpoint beyond the bearer-token check.
- The MIT license disclaims warranty. This plugin is beta software — use at your own risk and keep independent backups of important vaults.

## What counts as a vulnerability

In scope:

- Vault escape (writing or reading outside the vault root)
- Authentication bypass (reaching tools without a valid bearer token)
- Origin / DNS-rebinding bypasses
- Path-traversal that reaches sensitive Obsidian configuration files (e.g. `data.json` containing the bearer token)
- Crashes or hangs reachable from a single malformed MCP request
- Vulnerabilities in production dependencies that are reachable through the plugin's tool surface

Out of scope:

- Dev-dependency advisories that don't affect the shipped bundle (esbuild dev-server CORS, etc.)
- Anything requiring the user to deliberately misconfigure the plugin (binding to `0.0.0.0` on a hostile network, sharing the bearer token publicly)
- Social-engineering attacks on the user
- Features the plugin doesn't implement (we don't add capabilities just to remove them — features outside the current surface are not vulnerabilities)

## Response

You should receive an initial acknowledgment within 7 days. A more substantive response with a patch plan typically follows within 14 days for confirmed issues. Coordinated disclosure timelines are negotiable based on severity and whether the issue is being actively exploited.
