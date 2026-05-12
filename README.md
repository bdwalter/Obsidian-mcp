# Claude MCP for Obsidian

Obsidian community plugin that exposes your vault as a local [Model Context Protocol](https://modelcontextprotocol.io) server over Streamable HTTP. Drop the config snippet into Claude Code (or any MCP client) and Claude can read, search, and write notes through Obsidian's own API — backlinks, frontmatter, tag index, periodic notes, all of it.

Paired skills live at [Obsidian-skills](https://github.com/bdwalter/Obsidian-skills).

## Status

Early — v0.1.0. Tools are usable; the marketplace submission is pending.

## Tools

| Tool | Purpose |
| --- | --- |
| `search_vault` | Compose filters: body query, filename, tag, frontmatter key/value, folder. Paginated. |
| `list_notes` | List notes by mtime/ctime/path with `recursive`, `offset`, `limit`. Stale-note discovery. |
| `list_folders` | List folders under a path with note/subfolder counts. |
| `get_metadata_keys` | Frontmatter keys used across the vault, with usage counts. |
| `read_note` | Read body + parsed frontmatter + tags + mtime. |
| `get_daily_note` | Daily note for `today`/`yesterday`/`tomorrow`/`±Nd`/`±Nw`/ISO date. |
| `create_note` | Create a new note. Fails on existing path. |
| `update_note` | Overwrite a note. Backs prior contents into `.trash/`. |
| `append_to_note` | Append text, optionally under a specific heading. |
| `prepend_to_note` | Prepend text (after frontmatter if present). Backs up first. |
| `delete_note` | Move a note to `.trash/` (recoverable inside Obsidian). |
| `list_backlinks` | Resolved backlinks for a note. |
| `get_unresolved_links` | Wikilinks that don't yet point at a file. |
| `find_similar_notes` | Notes sharing tags/frontmatter — cheap heuristic. |

## Install (dev)

```bash
cd ~/GitHub/Obsidian-mcp
npm install
npm run dev
```

Symlink the build output into your vault (set `VAULT` to the absolute path of your vault first):

```bash
export VAULT="/path/to/your/vault"
PLUG="$VAULT/.obsidian/plugins/obsidian-claude-mcp"
mkdir -p "$PLUG"
ln -sf "$PWD/main.js"       "$PLUG/main.js"
ln -sf "$PWD/manifest.json" "$PLUG/manifest.json"
```

Reload Obsidian, enable the plugin in Settings → Community plugins, then open the plugin's settings tab. A bearer token is generated on first load.

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

Add it to `~/.claude/settings.json` (or your project's `.claude/settings.json`) under `mcpServers`. Restart Claude Code.

## Smoke test

After enabling the plugin once (so it generates a bearer token), verify the server end-to-end without going through Claude:

```bash
VAULT="/path/to/your/vault" ./scripts/smoke.sh
```

The script runs the MCP `initialize` handshake, lists tools, and calls `list_folders` + `list_notes` against the live server.

## Safety

- Server is bound to `127.0.0.1` by default and requires a bearer token on every request.
- Every `update_note` writes a timestamped backup into `.trash/` before overwriting (toggle in settings).
- The plugin is `isDesktopOnly: true` — mobile is not supported.

## License

MIT.
