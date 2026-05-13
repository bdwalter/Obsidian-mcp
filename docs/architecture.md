# Architecture

This document explains how the plugin is put together and why it's shaped that way. For dev setup and the contribution loop, see [`CONTRIBUTING.md`](../CONTRIBUTING.md). For tool descriptions, see the [README](../README.md).

## 30-second version

The plugin is an Obsidian community plugin that boots an HTTP server (port 27125 by default, loopback only) speaking the Model Context Protocol over Streamable HTTP. The server registers tools that wrap Obsidian's native vault and metadata APIs, plus resources (notes-as-resources) and prompts (server-provided templates). Auth is a bearer token. The entire surface is read-only by default behind a single setting; per-folder write scoping is a separate setting on top of that.

## Process model

```
┌──────────────────────────────────────────────────────────────────────┐
│  Obsidian (Electron, main + renderer)                                │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  obsidian-claude-mcp plugin (this repo's main.js)               │ │
│  │                                                                  │ │
│  │  ┌───────────────────┐                                          │ │
│  │  │  Node http server │  127.0.0.1:27125                         │ │
│  │  │   GET /health     │  ← no auth, liveness probe               │ │
│  │  │   POST /mcp       │  ← bearer + Origin gated                 │ │
│  │  └────────┬──────────┘                                          │ │
│  │           │                                                      │ │
│  │           ▼                                                      │ │
│  │  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  │ Streamable HTTP MCP transport (per session)               │  │ │
│  │  │  • new McpServer + ToolContext per new session            │  │ │
│  │  │  • registerAllTools(mcp, ctx)                             │  │ │
│  │  │  • registerResources(mcp, ctx)                            │  │ │
│  │  │  • registerPrompts(mcp, ctx)                              │  │ │
│  │  └────────┬──────────────────────────────────────────────────┘  │ │
│  │           │                                                      │ │
│  │           ▼                                                      │ │
│  │  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  │ Tool handlers (src/tools/*.ts)                            │  │ │
│  │  │   read.ts  search.ts  links.ts  write.ts  templates.ts    │  │ │
│  │  │   admin.ts                                                │  │ │
│  │  └────────┬──────────────────────────────────────────────────┘  │ │
│  │           │                                                      │ │
│  │           ▼                                                      │ │
│  │  ┌───────────────────────────────────────────────────────────┐  │ │
│  │  │ Obsidian native API                                       │  │ │
│  │  │   app.vault.*     metadataCache.*    fileManager.*        │  │ │
│  │  │   workspace.*     internalPlugins.*                       │  │ │
│  │  └───────────────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

   ▲
   │ HTTP, bearer token in Authorization header
   │
┌──┴──────────────────────────────────────────────────────────────┐
│ MCP clients (Claude Code, Claude Desktop, Cursor, mcp-inspector, │
│ direct curl, …) — local-only by default                          │
└──────────────────────────────────────────────────────────────────┘
```

Everything inside the dashed box lives in Obsidian's renderer process. There's no separate Node process — the plugin bundles its own HTTP server module and runs it inside Obsidian. Disabling the plugin tears down the listener; enabling it spins one back up.

## Request lifecycle

For a typical `tools/call` against `read_note`:

1. **HTTP receive.** `server.ts`'s `handle()` runs:
   - Routes `GET /health` early (no auth).
   - Origin header check (`isAllowedOrigin`) — reject if present and unknown.
   - Content-Length check — reject if > 16 MB.
   - Bearer token check via `crypto.timingSafeEqual`.
2. **Session resolution.** If `mcp-session-id` matches an existing transport, reuse it. Otherwise create a new `McpServer` instance, construct a fresh `ToolContext` (with a fresh `AuditLogger` tied to current settings), register all tools/resources/prompts on it, and connect a new `StreamableHTTPServerTransport`.
3. **JSON-RPC dispatch.** The MCP SDK's transport parses the request and routes by method. For `tools/call`, it locates the registered tool by name, validates `arguments` against the Zod schema, and invokes the handler.
4. **Tool execution.** The handler runs against the Obsidian app object. For write tools, the handler is wrapped by `registerAudited`, which calls `auditCallResult` after the handler returns to append a row to the audit log if enabled.
5. **Response.** The handler returns `{ content: [{ type: "text", text: <JSON> }] }`. The MCP SDK serializes it back as an SSE response.

## Per-session McpServer (why)

Each new MCP session gets its own `McpServer` instance with tools registered fresh. This is wasteful if you only ever have one client, but it has two benefits:

1. **Read-only and allow-list changes take effect on the next session.** Since the `restartServer` debounce tears down all existing transports on a settings change, the next request creates a new `McpServer` with the new settings reflected in tool registration (or non-registration, for the read-only case).
2. **Per-session isolation.** A misbehaving client can't pollute another session's tool registry, even though right now the registry is identical across sessions.

The downside is that auditing is wired per-session — `makeAuditLogger(app, settings)` is called every session. That's fine because the logger reads `settings.auditLog` at call time, so toggling the setting takes effect immediately.

## Tool surface design

The plugin aims to expose **primitives**, not workflows. The dividing line:

- If you can write the operation as a function of `read_note + search_vault + create_note + …`, it belongs **client-side** — as a Claude Code skill, a custom prompt, or a script — not as a new tool here.
- If it needs to touch Obsidian's API directly (link rewriting, frontmatter parsing, metadata cache), it's a **tool** and belongs in this plugin.

Concrete examples of the split:
- "Find all notes with no backlinks" — pure composition over `list_notes` + `list_backlinks` → client-side workflow.
- "Rename a note and update all incoming links" — needs `fileManager.renameFile` → plugin tool (`rename_note`).
- "Summarize today's daily note" — model + composition → client-side workflow (the plugin also ships a server prompt, `summarize-note`, that drives this kind of flow).
- "Modify just the `status` field in a note's frontmatter" — needs `fileManager.processFrontMatter` → plugin tool (`update_frontmatter`).

This keeps the plugin surface small enough to audit and lets workflow innovation happen without a plugin release.

## Settings as the source of truth

`ClaudeMcpSettings` lives in `src/settings.ts`. Everywhere else reads from this object — no globals, no separate config sources. Each setting has a sensible default that preserves backward-compatible behavior:

| Setting | Default | Effect of toggling |
|---|---|---|
| `bindHost` | `127.0.0.1` | Auto-restart server (~1.5s debounce) |
| `port` | `27125` | Auto-restart server |
| `bearerToken` | (generated on first load) | Live — read on every request |
| `readOnly` | `false` | Auto-restart server (registry skips write tools on next session) |
| `writeAllowFolders` | `[]` | Live — checked at request time |
| `auditLog` | `false` | Live — checked when writes complete |
| `auditLogPath` | `.claude-mcp-audit.md` | Live — read at log-write time |
| `trashOnWrite` | `true` | Live — checked at write time |

Settings that gate tool registration (`readOnly`) require a server restart because the per-session `McpServer` registers tools once at construction time. Settings that gate runtime behavior (auth, audit log, write allow-list, trash backup) are read fresh on each call. The settings tab UI uses `scheduleRestart` for the registration-affecting fields and lets the others apply immediately.

## Path safety

Every path that flows through a write tool goes through `safeVaultPath(input)`, which rejects:

- Empty paths
- Absolute paths (`/foo`, `\foo`)
- Windows drive-letter paths (`C:\foo`, `c:/foo`)
- Any path containing a `..` segment, on either separator (`../`, `\..\`, `folder/../escape`)
- Null bytes
- Post-normalization paths that still escape the vault (defense in depth)

Returns `{ ok: true, path: <normalized> }` or `{ ok: false, error: <reason> }`. Tools convert the failure case into a structured `{ error, path }` JSON response — they never throw.

`checkPath(input, settings)` wraps `safeVaultPath` and additionally enforces `writeAllowFolders` if non-empty. The two-function split exists because `restore_note`'s `trashPath` argument is read-from, not written-to, so it should pass safety but bypass the allow-list (which only applies to writes).

## Trash-based recovery

Every destructive write (`update_note`, `prepend_to_note`, `append_to_note`, `update_frontmatter`) backs up the prior contents to `.trash/<iso-ts>__<encoded-path>.md` before mutating. The filename encodes the original vault path with `/` → `__` so backups never collide across folders.

`restore_note` decodes that filename back to the original path and moves the file back. For `delete_note` backups (which use Obsidian's native `vault.trash`, leaving an untimestamped `<basename>.md` in `.trash/`), `restore_note` requires an explicit `target` because the original folder isn't recoverable from the filename.

This makes any single mutation reversible by the model without needing to re-write the file from memory. Combined with the audit log (which records what changed and when), it's the primary safety net for letting a model mutate the vault.

## What's intentionally not done

- **Confirm-on-destructive (synchronous user confirmation per write).** This would require blocking an MCP request while waiting for a click in the Obsidian UI, which either deadlocks or races a timeout. The read-only + write allow-list + audit log + trash backup combination provides equivalent safety without that UX hazard.
- **Real-time `roots`/`listChanged` notifications.** The MCP spec supports them; we haven't wired them up. Most clients re-handshake per session anyway.
- **Per-tool granular permissions.** Considered overkill given that read-only mode + write allow-list cover the common cases. Could be added if a real use surfaces.
- **Embeddings / semantic search.** Out of scope — needs a vector store and an embedding pipeline. Should live as a separate plugin or skill, not bundled here.
- **Templater (community plugin) syntax in `apply_template`.** Templater is a JavaScript runtime in templates; expanding it safely from outside Obsidian's normal flow is non-trivial. Only the core Templates plugin's `{{date}}`/`{{time}}`/`{{title}}` placeholders are expanded.

## Build-time injection

`esbuild.config.mjs` reads `manifest.json` at build time and injects `PLUGIN_VERSION` via `define`. `get_server_info` reports that constant, so a client/skill can detect plugin version without parsing `manifest.json` from the filesystem. The downside: the bundled JS has the version baked in — if someone hand-edits `manifest.json` without rebuilding, `get_server_info.version` will lie. Tied to the rebuild discipline.

## Trust model

Single-user, local-only.

- **Bearer token is the access control.** Anyone with the token can use any registered tool subject to the read-only and write-allow-list settings. Treat the token like a password.
- **Loopback binding is the network boundary.** `127.0.0.1` is the default; binding to `0.0.0.0` is supported but is a deliberate user choice.
- **Origin validation is defense-in-depth against DNS rebinding.** A malicious website your browser visits can't reach the loopback service with credentials unless the bearer token is in its config, but `Origin` checks add another layer.
- **Path safety is structural.** No untrusted path reaches `vault.adapter.write` without passing `safeVaultPath`.
- **No telemetry.** The plugin doesn't phone home. The only network traffic is the loopback HTTP server itself.

## Testing strategy

Three tiers, by automatability:

**Tier 1 — unit tests (CI, every push):** Pure functions in `src/util/` and pure tool helpers (like `expandTemplate`). 60+ tests, ~200ms total. Runs via Vitest with `tests/mocks/obsidian.ts` shimming the obsidian module.

**Tier 2 — integration with mocked Obsidian (deferred):** Not yet implemented. Would mock `app.vault` and `app.metadataCache` to test handlers end-to-end without a live Obsidian. The mocking surface is large enough that it's been deprioritized in favor of Tier 1 + Tier 3.

**Tier 3 — end-to-end against a live plugin (manual, pre-release):** `scripts/smoke.sh` (handshake + tools/list), `scripts/release-qa.sh` (full functional suite covering origin / auth / body / path / restore-roundtrip), `scripts/lifecycle-check.sh` (interactive port-release validator across N toggle cycles). Run these before tagging a release.

The CI gate (`npm test`) is sufficient to catch path-safety regressions, date-handling bugs, frontmatter parsing edge cases, and trash-name encode/decode mismatches — the bug classes that have historically slipped through manual smoke tests.
