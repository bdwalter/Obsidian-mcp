#!/usr/bin/env bash
# Release-QA: end-to-end probes against a live plugin. Run before tagging a release.
# Requires Obsidian running with the plugin enabled in a test vault.
#
# Usage:  VAULT=/path/to/test/vault bash scripts/release-qa.sh
#
# What this verifies (and what unit tests don't cover):
#   1. MCP handshake + tools/list reports the expected count
#   2. Auth: wrong bearer token returns 401
#   3. Origin validation: bad origin returns 403, localhost origin returns 200
#   4. Body size: oversize request returns 413
#   5. Path safety: traversal/absolute/drive-letter return structured errors
#   6. Tool roundtrip: create → read → update → delete → restore
#   7. Frontmatter handling: tags from frontmatter surface in read_note.tags
#
# Exit code 0 on full pass, nonzero on any failure. Prints a summary at the end.

set -uo pipefail

VAULT="${VAULT:-}"
PORT="${PORT:-27125}"
HOST="${HOST:-127.0.0.1}"
EXPECTED_TOOL_COUNT="${EXPECTED_TOOL_COUNT:-24}"

if [[ -z "$VAULT" ]]; then
  REG="$HOME/Library/Application Support/obsidian/obsidian.json"
  if [[ -f "$REG" ]]; then
    VAULT=$(python3 -c "import json; v=json.load(open('$REG'))['vaults']; print(next(iter(v.values()))['path'])" 2>/dev/null || true)
  fi
fi
if [[ -z "$VAULT" ]]; then
  echo "VAULT not set and could not be inferred from Obsidian registry." >&2
  exit 2
fi

DATA_FILE="$VAULT/.obsidian/plugins/obsidian-claude-mcp/data.json"
if [[ ! -f "$DATA_FILE" ]]; then
  echo "Plugin data.json not found at: $DATA_FILE" >&2
  exit 2
fi

TOKEN=$(python3 -c "import json; print(json.load(open('$DATA_FILE'))['bearerToken'])")
if [[ -z "$TOKEN" ]]; then
  echo "Bearer token empty in $DATA_FILE — open plugin settings to generate one." >&2
  exit 2
fi

URL="http://$HOST:$PORT/mcp"
PASS=0
FAIL=0
declare -a FAILURES

ok()   { echo "  ✓ $1"; PASS=$((PASS+1)); }
bad()  { echo "  ✗ $1"; FAIL=$((FAIL+1)); FAILURES+=("$1"); }

call_raw() {
  local extra_h="$1" body="$2"
  curl -sS -X POST "$URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "mcp-session-id: $SESSION" \
    ${extra_h:+-H "$extra_h"} \
    -d "$body"
}

extract() {
  awk '/^data: /{sub(/^data: /,""); print}'
}

# ── 1. Handshake ──────────────────────────────────────────────────────────
echo "1. MCP handshake"
INIT=$(curl -sS -i -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"qa","version":"0"}}}')
SESSION=$(printf '%s' "$INIT" | awk 'BEGIN{IGNORECASE=1} /^mcp-session-id:/ {print $2}' | tr -d '\r' | head -1)
if [[ -n "$SESSION" ]]; then
  ok "initialize returned session $SESSION"
else
  bad "initialize did not return a session id"
  echo "${FAILURES[@]}"; exit 1
fi
curl -sS -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' > /dev/null

# ── 2. Tools list ─────────────────────────────────────────────────────────
echo "2. tools/list"
COUNT=$(call_raw "" '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | extract | python3 -c "import json,sys; print(len(json.load(sys.stdin)['result']['tools']))")
if [[ "$COUNT" == "$EXPECTED_TOOL_COUNT" ]]; then
  ok "tools/list returned $COUNT tools"
else
  bad "tools/list returned $COUNT tools (expected $EXPECTED_TOOL_COUNT)"
fi

# ── 3. Auth ───────────────────────────────────────────────────────────────
echo "3. auth"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer wrong-but-same-length-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{}')
[[ "$CODE" == "401" ]] && ok "wrong bearer → 401" || bad "wrong bearer returned $CODE (expected 401)"

# ── 4. Origin ─────────────────────────────────────────────────────────────
echo "4. origin validation"
CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Origin: http://evil.com" \
  -d '{}')
[[ "$CODE" == "403" ]] && ok "evil origin → 403" || bad "evil origin returned $CODE (expected 403)"

CODE=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Origin: http://localhost:$PORT" \
  -H "mcp-session-id: $SESSION" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/list","params":{}}')
[[ "$CODE" == "200" ]] && ok "localhost origin → 200" || bad "localhost origin returned $CODE (expected 200)"

# ── 5. Body size ──────────────────────────────────────────────────────────
echo "5. body size limit"
CODE=$(python3 -c 'print("x"*(20*1024*1024))' | curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "mcp-session-id: $SESSION" \
  --data-binary @-)
[[ "$CODE" == "413" ]] && ok "20MB body → 413" || bad "20MB body returned $CODE (expected 413)"

# ── 6. Path safety ────────────────────────────────────────────────────────
echo "6. path safety"
check_path_rejected() {
  local label=$1 path=$2
  local result
  result=$(python3 -c "import json,sys; print(json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'create_note','arguments':{'path':sys.argv[1],'content':'x'}}}))" "$path" \
    | call_raw "" "$(cat)" 2>/dev/null | extract \
    | python3 -c "import json,sys; r=json.load(sys.stdin); t=r['result']['content'][0]['text']; print('error' if 'error' in t.lower() and ('absolute' in t.lower() or '..' in t or 'drive-letter' in t.lower()) else 'leaked')" 2>/dev/null)
  if [[ "$result" == "error" ]]; then
    ok "$label rejected with structured error"
  else
    bad "$label not properly rejected (got: $result)"
  fi
}
check_path_rejected "absolute /etc/x.md" "/etc/x.md"
check_path_rejected "parent-segment ../x.md" "../x.md"
check_path_rejected "drive-letter C:\\x.md" "C:\\x.md"

# ── 7. Tool roundtrip ─────────────────────────────────────────────────────
echo "7. tool roundtrip"
TEST_PATH="qa-test/release-qa-$(date +%s).md"
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':10,'method':'tools/call','params':{'name':'create_note','arguments':{'path':'$TEST_PATH','content':'---\ntags: [qa, release]\n---\n# QA\n\nBody.\n'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | grep -q '"created":true' && ok "create_note" || bad "create_note: $RESULT"

PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':11,'method':'tools/call','params':{'name':'read_note','arguments':{'path':'$TEST_PATH'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; print(r['result']['content'][0]['text'] if (r:=json.load(sys.stdin)) else '')")
echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); ok='qa' in d['tags'] and 'release' in d['tags'] and not d['body'].startswith('---'); sys.exit(0 if ok else 1)" \
  && ok "read_note: frontmatter tags surface in .tags, body strips FM" \
  || bad "read_note: tags or body shape wrong — $RESULT"

PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':12,'method':'tools/call','params':{'name':'update_note','arguments':{'path':'$TEST_PATH','content':'overwritten'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; print(r['result']['content'][0]['text'] if (r:=json.load(sys.stdin)) else '')")
echo "$RESULT" | grep -q '"backup":".trash/' && ok "update_note writes .trash backup" || bad "update_note backup missing: $RESULT"

BACKUP=$(echo "$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['backup'])")
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'jsonrpc':'2.0','id':13,'method':'tools/call','params':{'name':'delete_note','arguments':{'path':'$TEST_PATH'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; print(r['result']['content'][0]['text'] if (r:=json.load(sys.stdin)) else '')")
echo "$RESULT" | grep -q '"deleted":true' && ok "delete_note" || bad "delete_note: $RESULT"

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'jsonrpc':'2.0','id':14,'method':'tools/call','params':{'name':'restore_note','arguments':{'trashPath':'$BACKUP'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; print(r['result']['content'][0]['text'] if (r:=json.load(sys.stdin)) else '')")
echo "$RESULT" | grep -q '"restored"' && ok "restore_note (inferred target from timestamped backup)" || bad "restore_note: $RESULT"

PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':15,'method':'tools/call','params':{'name':'delete_note','arguments':{'path':'$TEST_PATH'}}}))")
call_raw "" "$PAYLOAD" > /dev/null

# ── 8. /health endpoint (no auth) ─────────────────────────────────────────
echo "8. /health endpoint"
HEALTH=$(curl -sS http://"$HOST":"$PORT"/health)
echo "$HEALTH" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
ok = d.get('status') == 'ok' and d.get('plugin') == 'obsidian-claude-mcp' and 'readOnly' in d and 'sessions' in d
sys.exit(0 if ok else 1)
" && ok "/health returns expected shape" || bad "/health shape unexpected: $HEALTH"

# ── 9. get_server_info shape ──────────────────────────────────────────────
echo "9. get_server_info"
PAYLOAD='{"jsonrpc":"2.0","id":30,"method":"tools/call","params":{"name":"get_server_info","arguments":{}}}'
INFO=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$INFO" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
required = ['plugin', 'version', 'vault', 'readOnly', 'trashOnWrite', 'auditLog', 'toolCount']
missing = [k for k in required if k not in d]
sys.exit(0 if not missing else 1)
" && ok "get_server_info returns expected fields" || bad "get_server_info missing keys: $INFO"

# ── 10. rename_note roundtrip ─────────────────────────────────────────────
echo "10. rename_note"
RENAME_FROM="qa-test/rename-src-$(date +%s).md"
RENAME_TO="qa-test/rename-dst-$(date +%s).md"
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':40,'method':'tools/call','params':{'name':'create_note','arguments':{'path':'$RENAME_FROM','content':'rename-test'}}}))")
call_raw "" "$PAYLOAD" > /dev/null
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':41,'method':'tools/call','params':{'name':'rename_note','arguments':{'from':'$RENAME_FROM','to':'$RENAME_TO'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | grep -q '"renamed":true' && ok "rename_note succeeded" || bad "rename_note: $RESULT"
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':42,'method':'tools/call','params':{'name':'read_note','arguments':{'path':'$RENAME_TO'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | grep -q "rename-test" && ok "renamed note readable at new path" || bad "renamed note not at new path: $RESULT"
CLEANUP=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':43,'method':'tools/call','params':{'name':'delete_note','arguments':{'path':'$RENAME_TO'}}}))")
call_raw "" "$CLEANUP" > /dev/null

# ── 11. update_frontmatter ────────────────────────────────────────────────
echo "11. update_frontmatter"
FM_PATH="qa-test/fm-$(date +%s).md"
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':50,'method':'tools/call','params':{'name':'create_note','arguments':{'path':'$FM_PATH','content':'---\ntags: [initial]\n---\nbody'}}}))")
call_raw "" "$PAYLOAD" > /dev/null
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':51,'method':'tools/call','params':{'name':'update_frontmatter','arguments':{'path':'$FM_PATH','set':{'status':'done','priority':3}}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | grep -q '"updated":true' && ok "update_frontmatter set keys" || bad "update_frontmatter: $RESULT"
PAYLOAD=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':52,'method':'tools/call','params':{'name':'read_note','arguments':{'path':'$FM_PATH'}}}))")
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
fm = d.get('frontmatter') or {}
sys.exit(0 if fm.get('status') == 'done' and fm.get('priority') == 3 and 'initial' in (fm.get('tags') or []) else 1)
" && ok "frontmatter set persisted and prior keys preserved" || bad "frontmatter content wrong: $RESULT"
CLEANUP=$(python3 -c "import json; print(json.dumps({'jsonrpc':'2.0','id':53,'method':'tools/call','params':{'name':'delete_note','arguments':{'path':'$FM_PATH'}}}))")
call_raw "" "$CLEANUP" > /dev/null

# ── 12. list_tags returns sensible shape ──────────────────────────────────
echo "12. list_tags"
PAYLOAD='{"jsonrpc":"2.0","id":60,"method":"tools/call","params":{"name":"list_tags","arguments":{}}}'
RESULT=$(call_raw "" "$PAYLOAD" | extract | python3 -c "import json,sys; r=json.load(sys.stdin); print(r['result']['content'][0]['text'])")
echo "$RESULT" | python3 -c "
import json, sys
d = json.loads(sys.stdin.read())
ok = 'count' in d and 'items' in d and 'scanned' in d
ok = ok and (len(d['items']) == 0 or ('tag' in d['items'][0] and 'count' in d['items'][0]))
sys.exit(0 if ok else 1)
" && ok "list_tags returns count/items/scanned shape" || bad "list_tags shape: $RESULT"

# ── 13. MCP resources/list ────────────────────────────────────────────────
echo "13. resources/list"
PAYLOAD='{"jsonrpc":"2.0","id":70,"method":"resources/list","params":{}}'
RESULT=$(call_raw "" "$PAYLOAD" | extract)
echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
res = r.get('result', {}).get('resources', [])
ok = len(res) >= 1 and all(x['uri'].startswith('obsidian-note:///') for x in res[:5])
sys.exit(0 if ok else 1)
" && ok "resources/list returns notes as obsidian-note:/// URIs" || bad "resources/list malformed: $RESULT"

# ── 14. MCP prompts/list ──────────────────────────────────────────────────
echo "14. prompts/list"
PAYLOAD='{"jsonrpc":"2.0","id":80,"method":"prompts/list","params":{}}'
RESULT=$(call_raw "" "$PAYLOAD" | extract)
echo "$RESULT" | python3 -c "
import json, sys
r = json.load(sys.stdin)
prompts = r.get('result', {}).get('prompts', [])
names = [p['name'] for p in prompts]
expected = {'summarize-note', 'extract-action-items', 'find-stale-notes'}
sys.exit(0 if expected.issubset(set(names)) else 1)
" && ok "prompts/list contains all 3 expected prompts" || bad "prompts/list missing prompts: $RESULT"

# ── Summary ───────────────────────────────────────────────────────────────
echo
echo "── Release-QA summary ──"
echo "  passed: $PASS"
echo "  failed: $FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo
  echo "Failures:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
echo "  ✓ all release-QA checks passed"
