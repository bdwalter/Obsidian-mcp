# Claude MCP for Obsidian

![CI](https://github.com/bdwalter/Obsidian-mcp/actions/workflows/ci.yml/badge.svg)

Obsidian community plugin that exposes your vault as a local [Model Context Protocol](https://modelcontextprotocol.io) server over Streamable HTTP. Drop the config snippet into Claude Code (or any MCP client) and Claude can read, search, and write notes through Obsidian's own API — backlinks, frontmatter, tag index, periodic notes, all of it.

Paired skills live at [Obsidian-skills](https://github.com/bdwalter/Obsidian-skills).

## Status

Early — v0.1.0. All tools are functional; community-plugin marketplace submission is pending. Recommended for early users via BRAT.

> **Beta software — use at your own risk.** This plugin is in active development and may change without notice. The MIT license disclaims all warranties (express or implied) — the author takes no responsibility for data loss, vault corruption, or any other damage that results from use. The `restore_note` tool and `.trash/` backups exist for a reason; back up your vault independently if it contains anything you can't afford to lose.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_vault` | Compose filters: body query, filename, tag, frontmatter key/value, folder. Paginated. |
| `list_notes` | List notes by mtime/ctime/path with `recursive`, `offset`, `limit`. Stale-note discovery. |
| `list_folders` | List folders under a path with note/subfolder counts. |
| `get_metadata_keys` | Frontmatter keys used across the vault, with usage counts. |
| `read_note` | Read parsed frontmatter, tags (frontmatter + inline), and body (frontmatter block stripped). |
| `get_daily_note` | Daily note for `today`/`yesterday`/`tomorrow`/`±Nd`/`±Nw`/ISO date. Honors the core Daily Notes plugin's folder + filename format if enabled. |
| `create_note` | Create a new note. Fails on existing path. |
| `update_note` | Overwrite a note. Backs prior contents into `.trash/`. |
| `append_to_note` | Append text, optionally under a specific heading. Backs up first. |
| `prepend_to_note` | Prepend text (after frontmatter if present). Backs up first. |
| `delete_note` | Move a note to `.trash/` (recoverable inside Obsidian). |
| `restore_note` | Restore a file from `.trash/` back into the vault. Infers destination from timestamped backups; takes an explicit `target` for `delete_note` outputs. |
| `list_backlinks` | Resolved backlinks for a note. |
| `get_unresolved_links` | Wikilinks that don't yet point at a file. |
| `find_similar_notes` | Notes sharing tags/frontmatter — cheap heuristic. |

## Install (dev)

```bash
cd ~/GitHub/Obsidian-mcp
npm install
npm run build
```

Symlink the build output into your vault (set `VAULT` to the absolute path of your vault first):

```bash
export VAULT="/path/to/your/vault"
PLUG="$VAULT/.obsidian/plugins/obsidian-claude-mcp"
mkdir -p "$PLUG"
ln -sf "$PWD/main.js"       "$PLUG/main.js"
ln -sf "$PWD/manifest.json" "$PLUG/manifest.json"
```

Reload Obsidian, enable the plugin in Settings → Community plugins, then open the plugin's settings tab. A bearer token is generated on first load. Copy it from settings.

> After rebuilding the plugin, **disable and re-enable it in Settings → Community plugins** so Obsidian picks up the new `main.js`. Symlinking the bundle is not enough — the plugin code is held in memory until reload.

## Wire Claude Code

Settings tab prints a ready-to-paste snippet. It looks like:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27125/mcp",
      "headers": { "Authorization": "Bearer <your token>" }
    }
  }
}
```

Add it to `~/.claude.json` under `mcpServers`. Restart Claude Code.

## Settings

- **Bind host** (`127.0.0.1`) — Loopback only by default. Changing this triggers an auto-restart of the server after ~1.5s of inactivity.
- **Port** (`27125`) — HTTP port. Same auto-restart behavior.
- **Bearer token** — Required on every request. Rotate at any time; rotation takes effect immediately (no restart needed). Copy or regenerate from settings.
- **Read-only mode** (default `off`) — When on, the server only registers read/search/link tools — `create_note`, `update_note`, `append_to_note`, `prepend_to_note`, `delete_note`, and `restore_note` are not registered at all (and don't appear in `tools/list`). Toggle triggers an auto-restart. Useful for safer dogfooding, sharing the bearer token with less-trusted clients, or protecting a reference vault you never want a model to modify.
- **Backup on overwrite** (default `on`, only relevant when read-only is off) — Before any `update_note` / `append_to_note` / `prepend_to_note`, prior contents are copied to `.trash/<iso-ts>__<path>.md` so you can roll back with `restore_note`.

## Smoke test

After enabling the plugin once (so it generates a bearer token), verify the server end-to-end without going through Claude:

```bash
VAULT="/path/to/your/vault" ./scripts/smoke.sh
```

The script runs the MCP `initialize` handshake, lists tools, and calls `list_folders` + `list_notes` against the live server.

## Security model

The plugin is intended for single-user, local-only access. Everything assumes you trust the bearer token, the loopback interface, and the machine. Defenses in place:

- **Loopback binding by default.** Server listens on `127.0.0.1` unless you explicitly change it.
- **Bearer token required.** Every request must carry `Authorization: Bearer <token>`. Comparison is constant-time (`crypto.timingSafeEqual`).
- **Origin validation.** Requests with an `Origin` header that isn't `http://127.0.0.1:<port>` / `http://localhost:<port>` / `http://<bindHost>:<port>` are rejected with `403`. This blocks DNS-rebinding attacks from malicious websites running in your browser.
- **Path safety.** Tool inputs are validated to reject absolute paths, drive-letter paths, `..` segments, and null bytes. Vault escape is structurally prevented.
- **Body size cap.** Requests larger than 16 MB are rejected with `413` before reaching the MCP handler.
- **Write rollback.** Destructive write tools back up prior contents into `.trash/` by default. `restore_note` brings them back.
- **Markdown-only reads.** `read_note` refuses non-`.md` files rather than streaming binary attachments as text.
- **Desktop only.** `isDesktopOnly: true` — mobile is not supported.

What this plugin does *not* protect against:
- A bearer token leak. Treat it like a password. If you copy it into a config file, that file is now sensitive.
- Anything running on the same machine as your user, since loopback is accessible. The bearer token is the only barrier.
- Skills or clients with the token doing damage to the vault — use `restore_note` and the `.trash/` backups to recover.

## Troubleshooting

**Plugin loaded but server didn't start.**
Check the developer console (`Cmd+Option+I`) for `[claude-mcp]` lines. The most common cause is port conflict — change the port in settings and the server will auto-restart.

**`Notice`: "port 27125 is already in use".**
Either another process is on that port (`lsof -i :27125` on macOS/Linux) or a previous instance didn't shut down cleanly. Restart Obsidian fully if a toggle off/on doesn't free it.

**`401 unauthorized`.**
Token mismatch. Copy it again from settings, or click "Generate" to rotate and update your client config.

**`403 forbidden_origin`.**
The request's `Origin` header doesn't match an allowed value. If you're integrating from a custom web client, either match the loopback origin or omit the `Origin` header.

**Tools list still shows old tools after a rebuild.**
Disable and re-enable the plugin in Settings → Community plugins. Symlinked `main.js` is read once at plugin load.

## License

MIT.
