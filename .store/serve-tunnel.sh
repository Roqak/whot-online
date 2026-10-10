#!/usr/bin/env bash
set -e

fuser -k 8787/tcp 2>/dev/null || true

python3 -m http.server 8787 --directory .store &
HTTP_PID=$!

cleanup() {
  kill $HTTP_PID 2>/dev/null || true
}
trap cleanup EXIT INT TERM

exec cloudflared tunnel --config /dev/null --url http://127.0.0.1:8787
