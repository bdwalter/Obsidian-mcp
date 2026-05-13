# Contributing

Thanks for your interest in improving Claude MCP for Obsidian. This guide covers the dev loop, where things live, and what we expect in a PR.

## Project shape

This is the Obsidian community plugin that runs the MCP server. Tools are thin wrappers over Obsidian's vault and metadata APIs.

The plugin aims to expose **primitives**, not workflows. If you can build something from `read_note + search_vault + create_note`, that belongs in a client-side workflow (a Claude Code skill, a custom prompt, a script), not as a new tool here.

## Dev setup

Prerequisites: Node 20+, npm.

```bash
git clone https://github.com/bdwalter/Obsidian-mcp
cd Obsidian-mcp
npm install
npm run build
```

Symlink the bundle into a real Obsidian vault for development:

```bash
export VAULT="/path/to/your/test/vault"
PLUG="$VAULT/.obsidian/plugins/obsidian-claude-mcp"
mkdir -p "$PLUG"
ln -sf "$PWD/main.js"       "$PLUG/main.js"
ln -sf "$PWD/manifest.json" "$PLUG/manifest.json"
```

Enable the plugin in Settings → Community plugins. The plugin generates a bearer token on first load.

**After any rebuild**, disable and re-enable the plugin in Obsidian — the JS bundle is read at load time and held in memory.

## Test loop

```bash
npm test                # unit tests (Vitest); fast, ~200ms
npm run typecheck       # tsc --noEmit
npm run build           # typecheck + production bundle
```

For end-to-end verification against a live plugin:

```bash
VAULT="/path/to/test/vault" bash scripts/smoke.sh        # MCP handshake + tools/list
VAULT="/path/to/test/vault" bash scripts/release-qa.sh   # full release-QA suite
bash scripts/lifecycle-check.sh                          # interactive port-release check
```

Add unit tests for any pure function you introduce or change. Tests live in `tests/`, mock Obsidian via `tests/mocks/obsidian.ts`.

## Code structure

```
src/
  main.ts            Plugin entry point — load/unload lifecycle, settings load, command registration
  server.ts          HTTP server, MCP transport, request handler, Origin/auth checks
  settings.ts        ClaudeMcpSettings interface, DEFAULT_SETTINGS, settings tab UI
  resources.ts       MCP resources registration (notes-as-resources)
  prompts.ts         MCP prompts registration
  tools/
    registry.ts      ToolContext type, registerAllTools entry point
    search.ts        search_vault, list_notes, list_folders, get_metadata_keys
    read.ts          read_note, get_daily_note, list_tags, get_note_outline
    links.ts         list_backlinks, get_unresolved_links, find_similar_notes
    write.ts         create_note, update_note, append/prepend, rename, frontmatter, delete, restore
    templates.ts     Templates plugin integration
    admin.ts         get_server_info, open_note_in_obsidian
  util/
    path.ts          safeVaultPath — path-safety guard for all write tools
    date.ts          local-time date resolution
    markdown.ts      stripFrontmatter
    trash.ts         backupToTrash
    trash-name.ts    encode/decode timestamped backup filenames
    audit.ts         AuditLogger + isWriteAllowed
tests/
  *.test.ts          Vitest suites for pure utilities
  mocks/obsidian.ts  Minimal obsidian module shim
scripts/
  smoke.sh           Quick handshake + tools/list
  release-qa.sh      Full e2e probes for tagged releases
  lifecycle-check.sh Interactive port-release validator
```

## Adding a new tool

1. Add the handler to the appropriate `src/tools/*.ts`.
2. For write tools, use the `checkPath(path, settings)` helper (path safety + write allow-list) and register via `registerAudited` so the audit log captures it.
3. For read tools, use `safeVaultPath` directly.
4. Write a unit test for any new pure helper functions.
5. Add the tool to the README's tool table and to `CHANGELOG.md` under `[Unreleased]`.
6. Run `scripts/release-qa.sh` against a live plugin if the tool affects vault state.

## Style

- TypeScript strict mode is on. No `any` unless escaping into an SDK type that's already permissive.
- Errors return a structured `{ error, ... }` JSON payload via `textResult`, not thrown exceptions. The MCP SDK does wrap thrown errors, but our convention is "expected failures return error JSON; only unexpected ones get caught and converted by the surrounding try/catch."
- No `console.log` for normal operation. `console.error` and the `[claude-mcp]` prefix are fine for diagnostic lines.
- Don't add a setting without a sensible default that preserves prior behavior.

## Commit messages

Short imperative subject (under 70 chars) + a body paragraph that says *why*. We don't use Conventional Commits enforced by tooling, but the style of existing commits ("Add CI badge", "Resolve dev-deps audit findings via esbuild + vitest major bumps") is the target. Skip ceremonial "Update file.ts" subjects — describe the change.

## Releases

See `CHANGELOG.md` for the running log. Releases are tagged from `main` after the changelog is moved from `[Unreleased]` to a versioned section. `manifest.json.version` must match the tag exactly (no `v` prefix), and `versions.json` must include the new version.

## Reporting bugs / asking questions

- Bug → GitHub Issues, use the Bug Report template.
- Feature idea → GitHub Issues, use the Feature Request template.
- General question or discussion → [GitHub Discussions](https://github.com/bdwalter/Obsidian-mcp/discussions).
- Security issue → [private vulnerability advisory](https://github.com/bdwalter/Obsidian-mcp/security/advisories/new). See `SECURITY.md`.
