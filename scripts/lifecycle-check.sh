#!/usr/bin/env bash
# Lifecycle health check: confirms the plugin cleanly releases its TCP port
# when disabled, and rebinds when re-enabled. Run this before submission.
#
# Usage:  bash scripts/lifecycle-check.sh
#   PORT=27125 bash scripts/lifecycle-check.sh
#
# The script is interactive — it pauses and asks you to toggle the plugin
# in Settings → Community plugins between checks.

set -euo pipefail

PORT="${PORT:-27125}"
HOST="${HOST:-127.0.0.1}"

probe() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1, $2}'
  else
    netstat -an 2>/dev/null | awk -v p=":$PORT" '$0 ~ p && /LISTEN/'
  fi
}

reachable() {
  curl -sS -o /dev/null -w "%{http_code}" -X POST "http://$HOST:$PORT/mcp" \
    -H "Content-Type: application/json" \
    -d '{}' \
    --max-time 2 2>/dev/null || echo "unreachable"
}

pause() {
  printf "\n→ %s\n" "$1"
  printf "  Press <enter> when ready... "
  read -r _
}

echo "== Claude MCP lifecycle check on $HOST:$PORT =="
echo

echo "Initial state:"
echo "  listeners: $(probe | tr '\n' ',' | sed 's/,$//')"
echo "  http:      $(reachable)"

ITERATIONS="${ITERATIONS:-5}"
fail=0
for i in $(seq 1 "$ITERATIONS"); do
  echo
  echo "── round $i / $ITERATIONS ──"

  pause "Disable Claude MCP in Settings → Community plugins"
  L=$(probe)
  H=$(reachable)
  echo "  after disable: listeners='$L' http=$H"
  if [[ -n "$L" ]]; then
    echo "  ✗ port still held — onunload may not be closing the server"
    fail=1
  elif [[ "$H" != "unreachable" ]]; then
    echo "  ✗ http still answering — stale socket"
    fail=1
  else
    echo "  ✓ port released cleanly"
  fi

  pause "Re-enable Claude MCP"
  L=$(probe)
  H=$(reachable)
  echo "  after enable:  listeners='$L' http=$H"
  if [[ -z "$L" ]]; then
    echo "  ✗ no listener after enable — startServer failed"
    fail=1
  elif [[ "$H" == "unreachable" ]]; then
    echo "  ✗ listener present but http unreachable"
    fail=1
  else
    echo "  ✓ rebind clean"
  fi
done

echo
if [[ $fail -eq 0 ]]; then
  echo "✓ lifecycle check passed ($ITERATIONS rounds)"
else
  echo "✗ lifecycle check failed — see output above"
  exit 1
fi
