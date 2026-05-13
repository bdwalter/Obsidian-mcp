# Working on this repo — guidance for Claude (and other AI assistants)

This file gives an AI coding assistant the context it needs to make good decisions in this repo without re-deriving conventions from scratch every session. Human readers: [`CONTRIBUTING.md`](CONTRIBUTING.md) is the friendlier version. The architectural design is in [`docs/architecture.md`](docs/architecture.md).

## What this project is

Obsidian community plugin that runs an MCP server (Streamable HTTP, loopback) and exposes the vault to Claude (and any MCP client) via tools, resources, and prompts. The plugin process *is* the MCP server — bundled `@modelcontextprotocol/sdk`, single Node HTTP listener on port 27125 by default.

Paired with `~/GitHub/Obsidian-skills` (a separate Claude Code skills pack). Skills compose the plugin's tools into workflows. **Strong bias: if a workflow can be built from existing tools, it belongs in the skills repo, not as a new tool here.**

## Repo layout (quick reference)

```
src/
  main.ts              Plugin lifecycle (onload/onunload, settings load, command registration)
  server.ts            HTTP server + MCP transport. Origin/auth/body-size guards live here.
  settings.ts          ClaudeMcpSettings interface, DEFAULT_SETTINGS, settings tab UI
  resources.ts         registerResources — notes-as-resources via obsidian-note:///
  prompts.ts           registerPrompts — server-provided prompt templates
  tools/
    registry.ts        ToolContext + registerAllTools entry. Read-only mode toggles here.
    search.ts          search_vault, list_notes, list_folders, get_metadata_keys
    read.ts            read_note, get_daily_note, list_tags, get_note_outline
    links.ts           list_backlinks, get_unresolved_links, find_similar_notes
    write.ts           create/update/append/prepend/delete/restore/rename/update_frontmatter
    templates.ts       Core Templates plugin integration
    admin.ts           get_server_info, open_note_in_obsidian
  util/
    path.ts            safeVaultPath — path-safety guard
    date.ts            Local-time date resolution
    markdown.ts        stripFrontmatter
    trash.ts           backupToTrash
    trash-name.ts      Timestamped backup filename encode/decode
    audit.ts           AuditLogger + isWriteAllowed
tests/
  *.test.ts            Vitest suites for pure utilities
  mocks/obsidian.ts    Minimal obsidian module shim
scripts/
  smoke.sh             Handshake + tools/list
  release-qa.sh        23-check end-to-end suite (auth, origin, body, path safety, tool roundtrip, /health, resources, prompts)
  lifecycle-check.sh   Interactive port-release validator
docs/
  architecture.md      Process model, request lifecycle, design rationale
```

## Conventions that aren't obvious from the code

### Tool surface stays thin

The plugin exposes **primitives**. If you find yourself writing a tool that composes other tools, stop and write a skill instead. The split:

| Looks like… | Belongs as… |
|---|---|
| "Find notes with no backlinks" — pure composition over list_notes + list_backlinks | Skill |
| "Rename a note + update incoming wikilinks" — needs Obsidian's fileManager API | Tool (we have `rename_note`) |
| "Summarize today's daily note" — model + tools | Skill (and the `summarize-note` server prompt) |
| "Add a tag to frontmatter without rewriting the body" — needs processFrontMatter | Tool (we have `update_frontmatter`) |

### Path safety is structural, not optional

Every path that flows into a write tool goes through `checkPath(input, settings)` from `src/tools/write.ts`, which wraps `safeVaultPath` (from `src/util/path.ts`) plus the `writeAllowFolders` allow-list. **Do not call `app.vault.*` with a user-supplied path that hasn't been through `safeVaultPath`.** Read-source paths (like restore_note's `trashPath`) use `checkSafePath` which skips the allow-list but keeps safety.

### Errors are JSON, not exceptions

Tool handlers return `textResult(JSON.stringify({ error: "...", ...context }))` for *expected* failures (not found, already exists, invalid path). Only *unexpected* errors bubble through a try/catch and get converted to a structured payload. Reviewers (and `release-qa.sh`) expect this convention — never let a raw Obsidian error reach the MCP client.

### Audit + allow-list are wired centrally

Adding a new write tool? Register it via `registerAudited(mcp, audit, name, desc, schema, handler)` from `src/tools/write.ts`. That handles audit-log appending automatically. Use `checkPath(path, settings)` inside the handler. **Don't reinvent these per tool** — bypassing them creates a security hole.

### Settings have defaults that preserve behavior

Every setting in `ClaudeMcpSettings` has a default that makes the plugin behave exactly as it did before that setting existed. When adding one, default to "off" / "empty" / "no restriction" — never break existing installs.

### Read-only mode = tools are not registered

When `settings.readOnly === true`, `registerWriteTools` is skipped entirely in `tools/registry.ts`. The MCP `tools/list` truthfully shows fewer tools, and `tools/call` on a write tool returns `MCP error -32602: Tool ... not found`. This is the right model — capabilities should reflect reality, not just be rejected at dispatch.

## The test loop

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run — pure-function tests, ~200ms
npm run lint        # eslint
npm run format      # prettier --write (auto-fix)
npm run format:check
npm run build       # typecheck + production esbuild bundle
```

Pre-commit, run `npm run format && npm run lint && npm test && npm run build`. CI runs the same gates on every push.

End-to-end against a live plugin:

```bash
VAULT=/path/to/vault bash scripts/release-qa.sh
```

Run this before any release tag. Catches integration regressions that unit tests can't.

## Reload-after-rebuild

The plugin bundle (`main.js`) is read at plugin load time and held in memory. Symlinking the rebuilt bundle into the vault's plugin folder is not enough — **you must disable and re-enable the plugin in Obsidian's Settings → Community plugins** for the new code to take effect. Or `Cmd+P → "Reload app without saving"`. This trips up every Claude session that doesn't know to ask.

## Gotchas

- **`baseUrl` removed from tsconfig.** TypeScript 6 deprecates it. Don't add it back. Use relative imports.
- **Zod 4 record syntax.** `z.record(z.string(), z.unknown())` — both args required. The shorthand `z.record(z.unknown())` is gone.
- **Obsidian internal APIs are typed `any` deliberately.** `metadataCache.resolvedLinks`, `metadataCache.unresolvedLinks`, `app.internalPlugins.plugins["..."]` aren't in the published Obsidian types. ESLint flags them as warnings — don't try to "fix" them, the warnings are correct documentation.
- **`window.moment` is Obsidian's bundled moment.** Used for daily-note filename formatting. Don't add moment as a dep.
- **The bundle target is ES2022.** Modern Electron, Node 20+. Use top-level await, Error cause, etc.
- **Per-session McpServer.** `server.ts` creates a fresh `McpServer` instance for every new MCP session. Tool registration happens per session. This is intentional — settings changes take effect on the next session without needing to mutate live registries.

## When you add a tool

1. Pick the right file (`src/tools/{search,read,links,write,templates,admin}.ts`).
2. Use `mcp.tool(name, description, zodSchema, handler)` for reads/admins; use `registerAudited(mcp, audit, ...)` for writes.
3. For paths, use `safeVaultPath` (reads) or `checkPath(p, settings)` (writes).
4. Return `textResult(JSON.stringify({ ... }))`. Errors include an `error` key.
5. Add a row to the README tool table.
6. Add an entry under `[Unreleased]` in `CHANGELOG.md`.
7. Bump `EXPECTED_TOOL_COUNT` in `scripts/release-qa.sh` to match.
8. If the tool has pure helper logic, extract it to `src/util/` and add a Vitest suite.

## When you add a setting

1. Add to `ClaudeMcpSettings` interface and `DEFAULT_SETTINGS` in `settings.ts`.
2. Add a `new Setting(containerEl)...` block in `ClaudeMcpSettingTab.display()`.
3. If the setting requires a server restart (changes tool registration, port, host), call `this.plugin.scheduleRestart("reason")` in the onChange handler. Other live settings are read fresh per request.
4. Document in README's Settings section.
5. Expose in `get_server_info` (in `src/tools/admin.ts`) if it's meaningful for clients/skills to query.

## When you bump dependencies

Run `npm audit`, `npm run build`, `npm test`, `bash scripts/release-qa.sh` (against a live plugin), and check `git diff main.js` size — a sudden jump usually means a transitive dep got fatter.

If a major dep version requires code changes (zod 4 record signature, TS 6 baseUrl removal), document the rationale in the commit message and `CHANGELOG.md`.

## Style preferences

- Short, descriptive commit subjects ("Add rename_note tool", "Fix Origin header check for IPv6 hosts"). Body explains *why*.
- Prefer extracting pure helpers to `src/util/` and unit-testing them over inline complexity.
- Error messages are user-facing for skills/clients — write them like documentation, not stack-trace fragments.
- No `console.log` for normal operation. `console.error` with `[claude-mcp]` prefix is fine for true diagnostics.

## What's deliberately not done

- **Confirm-on-destructive UI.** Considered; rejected. Would block an MCP request waiting for a click. The audit log + read-only mode + write allow-list cover the same need.
- **Real-time `roots`/`listChanged` notifications.** Spec-supported but most clients re-handshake per session.
- **Templater (community plugin) syntax expansion.** Templater is JS-in-templates; expanding it outside Obsidian's runtime is non-trivial. Only the core `{{date}}`/`{{time}}`/`{{title}}` placeholders are expanded.
- **Embedding-based search.** Out of scope. Belongs as a separate plugin if anyone wants it.
