# Installing Claude MCP for Obsidian

> **This guide will be obsolete once the plugin is accepted into the Obsidian Community Plugins marketplace.** At that point, install will be: open Obsidian → Settings → Community plugins → Browse → search "Claude MCP" → Install → Enable. No GitHub steps, no manual downloads. Until then, use one of the routes below.

There are three ways to install, in order of recommendation:

1. **[BRAT](#1-brat-recommended-for-most-users)** — easiest if you're not a developer. BRAT (Beta Reviewers Auto-update Tool) is a community plugin designed to install other plugins from GitHub. Handles updates automatically.
2. **[Manual release download](#2-manual-release-download)** — no extra plugins. Download release artifacts, drop them in the vault, enable.
3. **[From source (dev install)](#3-from-source-dev-install)** — clone, build, symlink. For contributors or anyone modifying the plugin.

After installing by any route, see **[First-run setup](#first-run-setup)** to generate a token and wire Claude Code.

---

## 1. BRAT (recommended for most users)

Prereq: install [BRAT](https://github.com/TfTHacker/obsidian42-brat) from Obsidian's community marketplace first if you don't have it.

1. **Settings → Community plugins → Browse → search "BRAT"** → Install → Enable.
2. **Settings → BRAT → Add Beta plugin**.
3. Paste the repo URL: `https://github.com/bdwalter/Obsidian-mcp`
4. Click **Add Plugin**. BRAT fetches the latest release and installs it.
5. **Settings → Community plugins** → find **Claude MCP** in the installed list → toggle it **on**.

BRAT will auto-update the plugin whenever a new release is tagged.

If you want updates to require manual approval instead of auto-applying, toggle "Auto-update at startup" off in BRAT settings.

---

## 2. Manual release download

Use this if you don't want to install BRAT and don't want to build from source.

1. Go to the [latest release](https://github.com/bdwalter/Obsidian-mcp/releases/latest).
2. Download three files from the **Assets** section:
   - `main.js`
   - `manifest.json`
   - `versions.json`
3. In your vault, create the directory `<vault>/.obsidian/plugins/obsidian-claude-mcp/` (the trailing folder name must match exactly — that's the plugin id).
4. Drop the three downloaded files into that directory.
5. In Obsidian: **Settings → Community plugins** → make sure **Restricted mode** is **off** (community plugins won't load otherwise) → toggle **Claude MCP** **on** in the Installed plugins list.

To update later, repeat the download and overwrite the three files. Then disable and re-enable the plugin to load the new bundle.

---

## 3. From source (dev install)

For contributors. See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for the full dev loop. The short version:

```bash
git clone https://github.com/bdwalter/Obsidian-mcp
cd Obsidian-mcp
npm install
npm run build

export VAULT="/path/to/your/vault"
PLUG="$VAULT/.obsidian/plugins/obsidian-claude-mcp"
mkdir -p "$PLUG"
ln -sf "$PWD/main.js"       "$PLUG/main.js"
ln -sf "$PWD/manifest.json" "$PLUG/manifest.json"
ln -sf "$PWD/versions.json" "$PLUG/versions.json"
```

Then enable in Obsidian's Settings → Community plugins. After future rebuilds, disable and re-enable the plugin to pick up the new bundle.

---

## First-run setup

After installing and enabling the plugin (any of the three routes above):

### Generate / copy the bearer token

1. **Settings → Claude MCP** (in the plugin list, under the community plugins section).
2. A bearer token is auto-generated on first load. Copy it from the "Bearer token" field, or click **Generate** to rotate it.

### Wire Claude Code (or any MCP client)

The settings tab includes a **Claude Code MCP config snippet** section with a ready-to-paste JSON block. Click **Copy** and add it to `~/.claude.json` under the top-level `mcpServers` key:

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

Restart Claude Code. The Obsidian tools (`mcp__obsidian__search_vault`, `mcp__obsidian__read_note`, etc.) will be available natively.

For other clients:

| Client | Config file location |
|---|---|
| Claude Desktop | Settings → Developer → Edit Config (path varies by OS) |
| Cursor / Cline / Continue | Each has its own MCP config UI; the URL and bearer pattern are the same |
| `mcp-inspector` | Pass URL + bearer via CLI flags |

### Verify it works

A no-auth liveness probe:

```bash
curl http://127.0.0.1:27125/health
# → {"status":"ok","plugin":"obsidian-claude-mcp","readOnly":false,"sessions":N}
```

If you cloned the repo, the bundled smoke script does a fuller check:

```bash
VAULT="/path/to/your/vault" bash scripts/smoke.sh
```

It runs the MCP `initialize` handshake, lists tools, and calls `list_folders` + `list_notes` against the live server.

---

## Settings worth knowing about

After the basics work, these are the toggles you'll most likely want:

- **Read-only mode** — Disables all write/delete/restore tools. Useful while you're getting comfortable letting a model touch your vault.
- **Write allow-folders** — Comma-separated list of folder prefixes (e.g. `Inbox, Daily`). When non-empty, writes outside these folders are refused. Strictly more useful than read-only when you want to allow capture in a sandbox folder but protect everything else.
- **Audit log** — Appends every write-tool call to a vault note (default `.claude-mcp-audit.md`) so you can review what's been happening.
- **Backup on overwrite** — On by default. Every `update_note` / `append_to_note` / `prepend_to_note` writes a timestamped backup into `.trash/` before modifying. `restore_note` can bring them back.

See [README → Settings](../README.md#settings) for the full list and details.

---

## Updating

| Install route | Update path |
|---|---|
| BRAT | Automatic on Obsidian startup, or trigger via Settings → BRAT → "Check for updates" |
| Manual | Re-download the three release artifacts, overwrite, disable + re-enable plugin |
| From source | `git pull && npm run build`, then disable + re-enable the plugin |

The plugin bundle is held in memory after load — **disabling and re-enabling the plugin is required after any update** (BRAT does this for you).

---

## Uninstalling

1. **Settings → Community plugins → Installed plugins**.
2. Find **Claude MCP** → click the trash icon next to it. Or:
3. Manually delete `<vault>/.obsidian/plugins/obsidian-claude-mcp/`.

The plugin doesn't write anything outside its own folder, the vault's `.trash/` (for backups), and — if you turned on the audit log — wherever you pointed `auditLogPath`. Those are yours to keep or delete.

If you wired Claude Code, remove the `mcpServers.obsidian` entry from `~/.claude.json` to stop the client from trying to reach a server that's no longer there.

---

## Troubleshooting

**Plugin loads but server doesn't start.**
Open the developer console (`Cmd+Option+I` on macOS, `Ctrl+Shift+I` elsewhere) and look for `[claude-mcp]` lines. Most common cause: port 27125 already in use by something else (`lsof -i :27125` on macOS/Linux). Change the port in Settings → Claude MCP; the server auto-restarts ~1.5s after the change.

**`401 unauthorized` from a client.**
Bearer token mismatch. Copy it again from settings, or click **Generate** to rotate and update your client config. Token changes take effect immediately — no restart needed.

**`403 forbidden_origin`.**
The request's `Origin` header doesn't match `http://127.0.0.1:<port>`, `http://localhost:<port>`, or `http://<bindHost>:<port>`. If you're integrating from a custom web client, either match one of those origins or omit the `Origin` header entirely (curl and most non-browser clients do this).

**Tools list shows old tools after a plugin update.**
Disable and re-enable the plugin in Settings → Community plugins. The bundle is read once at load time.

**BRAT says "version not found".**
The repo's latest release tag and the `manifest.json` version must match. If you're a contributor and just tagged a release, wait a minute or two for GitHub to publish it.

**Plugin doesn't appear in the Browse list.**
Until the marketplace submission is accepted, the plugin is **not** in the Browse list. Use BRAT or manual install (above). This guide will be deleted when the marketplace listing goes live.

---

## What does the plugin write to your filesystem?

Just three places, all inside the vault:

1. **The plugin's data file**: `<vault>/.obsidian/plugins/obsidian-claude-mcp/data.json` — stores your bearer token and settings.
2. **The vault's trash**: `<vault>/.trash/` — receives backups before destructive writes and full files on delete. Recoverable via `restore_note` or by moving files back manually.
3. **The audit log** (only if you turn it on): `<vault>/.claude-mcp-audit.md` by default, or wherever you set `auditLogPath`.

No telemetry. No cloud calls. The only network surface is the loopback HTTP server itself.
