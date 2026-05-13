# Changelog

All notable changes to this project are documented here. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0-beta.1] - 2026-05-13

First public pre-release. Available via BRAT and as a tagged GitHub release with `main.js`, `manifest.json`, and `versions.json` attached.

### Tools

- 9 read/search/link tools: `search_vault`, `list_notes`, `list_folders`, `get_metadata_keys`, `read_note`, `get_daily_note`, `list_backlinks`, `get_unresolved_links`, `find_similar_notes`.
- 3 discovery tools: `list_tags` (distinct from `get_metadata_keys` — actual tags with counts), `get_note_outline` (heading hierarchy from metadata cache).
- 8 write tools: `create_note`, `update_note`, `append_to_note` (optionally under a heading), `prepend_to_note`, `delete_note`, `restore_note`, `rename_note` (auto-rewrites incoming wikilinks via `fileManager.renameFile`), `update_frontmatter` (surgical YAML edits via `processFrontMatter`).
- 3 template tools: `list_templates`, `get_template`, `apply_template` — core Templates plugin integration. Expands `{{date}}`/`{{time}}`/`{{title}}` placeholders. Templater (community plugin) syntax is left as-is.
- 2 admin tools: `get_server_info` (plugin version, vault name, settings state, tool count), `open_note_in_obsidian`.

### MCP protocol surface

- **Resources**: notes addressable as `obsidian-note:///<path>`; `resources/list` returns up to 500 markdown files.
- **Prompts**: `summarize-note`, `extract-action-items`, `find-stale-notes` — server-provided prompt templates that drive common synthesis workflows.

### HTTP endpoints

- `POST /mcp` — MCP Streamable HTTP transport. Bearer token required; constant-time comparison via `crypto.timingSafeEqual`. Origin header validated (DNS-rebinding defense). Body capped at 16 MB.
- `GET /health` — No-auth liveness probe returning `{ status, plugin, readOnly, sessions }`.

### Safety

- Loopback binding by default (`127.0.0.1`).
- `safeVaultPath` rejects absolute paths, Windows drive letters, `..` segments, and null bytes structurally across all write tools.
- Backup-on-overwrite: every `update_note` / `append_to_note` / `prepend_to_note` / `update_frontmatter` copies prior contents to `.trash/<iso-ts>__<encoded-path>.md` before writing; `restore_note` reverses it.
- Read-only mode setting: when enabled, write tools are not registered with the MCP server at all (truthful capability surface, not runtime rejection).
- Write allow-list setting (`writeAllowFolders`): comma-separated folder prefixes that scope write tools. Empty list (default) allows writes anywhere.
- Audit log setting: every write-tool call is appended to a vault note (default `.claude-mcp-audit.md`) with timestamp, tool name, args, and result.
- Read tools refuse non-`.md` files (no streaming binary attachments as text).

### Settings UX

- Auto-restart on port / bind-host / read-only changes (debounced ~1.5s).
- Bearer token rotation takes effect immediately (no restart required).
- Settings tab includes a ready-to-paste `~/.claude.json` snippet with one-click copy.
- Open-source notice + repo link in the settings tab footer.

### Build & release infrastructure

- `versions.json` for Obsidian release compatibility mapping.
- esbuild `define` injects `PLUGIN_VERSION` at build time from `manifest.json`.
- GitHub Actions CI: format check (Prettier) + lint (ESLint TypeScript) + typecheck + Vitest + bundle build, on push and PR.
- GitHub Actions release workflow: on semver tag push, validates `manifest.json.version === tag` and that `versions.json` includes the version, then creates a GitHub Release with `main.js`, `manifest.json`, `versions.json` attached.
- Dependabot config for npm (weekly, grouped minor/patch) and GitHub Actions (monthly).
- 61 unit tests across path safety, date resolution, frontmatter stripping, trash-name encoding, write allow-list, and template expansion.
- `scripts/release-qa.sh` — 23 end-to-end checks against a live plugin.
- `scripts/lifecycle-check.sh` — interactive port-release validator across N toggle cycles.
- `scripts/smoke.sh` — fast handshake + tools/list probe.

### Documentation

- README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, SUPPORT, CODEOWNERS.
- `docs/install.md` — pre-marketplace install guide (BRAT, manual, from-source) plus first-run setup, updating, uninstalling, troubleshooting.
- `docs/architecture.md` — process model, request lifecycle, design rationale.
- `CLAUDE.md` — repo-specific guidance for AI coding assistants.
- Issue templates (bug, feature) and PR template.

### Tooling

- Prettier + ESLint (flat config) with TypeScript support.
- `.editorconfig` and `.nvmrc` (Node 20) for editor/runtime consistency.
- TypeScript 6 with target `ES2022`.
