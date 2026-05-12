#!/usr/bin/env bash
# Smoke-test the running plugin: initialize, list tools, call list_folders.
# Run after enabling the plugin in Obsidian (so it has generated a bearer token).
#
# Usage: VAULT=/path/to/vault ./scripts/smoke.sh
#        VAULT=/path/to/vault PORT=27125 HOST=127.0.0.1 ./scripts/smoke.sh
#
# If VAULT is unset, the script tries to read your first vault from Obsidian's
# registry at ~/Library/Application Support/obsidian/obsidian.json (macOS).

set -euo pipefail

if [[ -z "${VAULT:-}" ]]; then
  REG="$HOME/Library/Application Support/obsidian/obsidian.json"
  if [[ -f "$REG" ]]; then
    VAULT=$(python3 -c "import json; v=json.load(open('$REG'))['vaults']; print(next(iter(v.values()))['path'])" 2>/dev/null || true)
  fi
fi

if [[ -z "${VAULT:-}" ]]; then
  echo "VAULT is not set and could not be inferred. Try: VAULT=/path/to/your/vault $0" >&2
  exit 1
fi

PORT="${PORT:-27125}"
HOST="${HOST:-127.0.0.1}"
DATA_FILE="$VAULT/.obsidian/plugins/obsidian-claude-mcp/data.json"
URL="http://$HOST:$PORT/mcp"

if [[ ! -f "$DATA_FILE" ]]; then
  echo "data.json not found at $DATA_FILE — has the plugin loaded at least once?" >&2
  exit 1
fi

TOKEN=$(python3 -c "import json,sys; print(json.load(open('$DATA_FILE'))['bearerToken'])")
if [[ -z "$TOKEN" ]]; then
  echo "bearerToken is empty in $DATA_FILE — open the plugin's settings tab to generate one." >&2
  exit 1
fi

echo "URL:    $URL"
echo "Token:  ${TOKEN:0:8}… (${#TOKEN} chars)"
echo

call() {
  local body=$1
  local extra_headers=("${@:2}")
  local args=(
    -sS -i
    -X POST "$URL"
    -H "Authorization: Bearer $TOKEN"
    -H "Content-Type: application/json"
    -H "Accept: application/json, text/event-stream"
  )
  for h in "${extra_headers[@]}"; do args+=(-H "$h"); done
  curl "${args[@]}" -d "$body"
}

echo "=== initialize ==="
INIT=$(call '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}')
echo "$INIT"
SESSION=$(printf '%s' "$INIT" | awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {print $2}' | tr -d '\r' | head -1)
echo
echo "Session: $SESSION"
if [[ -z "$SESSION" ]]; then
  echo "No session id returned — check auth and that the server is running." >&2
  exit 1
fi

echo
echo "=== notifications/initialized ==="
call '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' "mcp-session-id: $SESSION" >/dev/null

echo
echo "=== tools/list ==="
call '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' "mcp-session-id: $SESSION" | sed -n '/^{/,$p' | python3 -m json.tool 2>/dev/null || true

echo
echo "=== tools/call list_folders (recursive=false) ==="
call '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_folders","arguments":{"recursive":false}}}' "mcp-session-id: $SESSION" | sed -n '/^{/,$p'
echo

echo
echo "=== tools/call list_notes (limit=3) ==="
call '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_notes","arguments":{"limit":3}}}' "mcp-session-id: $SESSION" | sed -n '/^{/,$p'
echo
