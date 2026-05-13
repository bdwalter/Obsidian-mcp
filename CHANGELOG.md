# Changelog

All notable changes to this project are documented here. Format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **MCP resources**: notes are addressable as `obsidian-note:///<path>` and discoverable via `resources/list` (capped at 500 entries in large vaults — use `search_vault`/`list_notes` for full traversal).
- **MCP prompts**: `summarize-note`, `extract-action-items`, `find-stale-notes` — server-provided prompt templates for common workflows.
- **`/health` HTTP endpoint** at `GET /<bindHost>:<port>/health` returning `{ status, plugin, readOnly, sessions }`. No auth required (read-only metadata).
- **`rename_note`** tool — uses Obsidian's `fileManager.renameFile` so all incoming wikilinks are auto-rewritten.
- **`update_frontmatter`** tool — surgical YAML edits via `app.fileManager.processFrontMatter`, with `set` and `unset` operations. Backs up to `.trash/` before writing.
- **`list_tags`** tool — distinct from `get_metadata_keys`; returns all tags (inline + frontmatter) with usage counts, sorted descending.
- **`get_note_outline`** tool — returns heading hierarchy from metadata cache.
- **`open_note_in_obsidian`** tool — focuses a note in the active Obsidian window via `workspace.openLinkText`.
- **`list_templates`, `get_template`, `apply_template`** tools — integration with the core Templates plugin. Expands `{{date}}`, `{{time}}`, `{{title}}` placeholders. Templater (community plugin) syntax is not expanded.
- **`get_server_info`** tool — returns plugin version, vault name, read-only state, tool count, and active settings flags.
- **Write allow-list** setting (`writeAllowFolders`) — comma-separated folder prefixes that scope write tools. Empty list (default) allows writes anywhere; non-empty restricts.
- **Audit log** setting — when enabled, every write-tool call is appended to a vault note (default `.claude-mcp-audit.md`) with timestamp, tool name, args, and result. Defaults off.

### Changed

- Plugin version surfaced in `get_server_info` and the `[claude-mcp]` startup log line is now read at build time from `manifest.json` via an esbuild `define`.

### Tests

- Added unit tests for `isWriteAllowed` and `expandTemplate`. Test count: 48 → 61.

## [0.1.0] - 2026-05-12

Initial submission-ready release.

### Added

- 14 vault tools across read/search/link/write categories (see README for the full table).
- Streamable HTTP MCP server on `127.0.0.1:27125` with bearer-token auth.
- Origin header validation (DNS-rebinding defense).
- Constant-time bearer comparison (`crypto.timingSafeEqual`).
- 16 MB request body size cap (HTTP 413).
- Path safety (`safeVaultPath`): rejects absolute paths, drive letters, `..` segments, null bytes.
- Per-overwrite backup to `.trash/<iso-ts>__<encoded-path>` for `update_note` / `append_to_note` / `prepend_to_note`.
- `restore_note` tool — brings files back from `.trash/`, infers destination from timestamped backups.
- Read-only mode setting — when enabled, write tools are not registered with the MCP server at all (truthful capability surface).
- Auto-restart on port / bind-host changes (debounced ~1.5s).
- `versions.json` for Obsidian release compatibility mapping.
- GitHub Actions CI: typecheck + Vitest + bundle build.
- 48 unit tests across path safety, date resolution, frontmatter stripping, trash-name encoding.
- `scripts/release-qa.sh` — end-to-end probes for live server before tagging.
- `scripts/lifecycle-check.sh` — interactive port-release validator.
