#!/bin/sh
set -e

bun run --watch src/index.ts &
BUN_PID=$!
LAST_MTIME=$(stat -c %Y /app/.env 2>/dev/null || echo 0)

while true; do
  sleep 2
  NEW_MTIME=$(stat -c %Y /app/.env 2>/dev/null || echo 0)
  if [ "$NEW_MTIME" != "$LAST_MTIME" ]; then
    echo "→ .env changed, restarting..."
    kill $BUN_PID 2>/dev/null
    wait $BUN_PID 2>/dev/null
    exit 0
  fi
  if ! kill -0 $BUN_PID 2>/dev/null; then
    wait $BUN_PID 2>/dev/null
    exit 1
  fi
done
