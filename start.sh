#!/usr/bin/env bash
set -euo pipefail

# Antigravity Pulse — macOS / Linux Launcher (counterpart to start.ps1)

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.gemini/bin:$PATH"

PORT="8765"
HOST_ADDR="0.0.0.0"
USE_TUNNEL="0"
SKIP_BUILD="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port|-p)
      PORT="${2:-8765}"
      shift 2
      ;;
    --host|-h)
      HOST_ADDR="${2:-0.0.0.0}"
      shift 2
      ;;
    --tunnel|-t)
      USE_TUNNEL="1"
      shift
      ;;
    --skip-build)
      SKIP_BUILD="1"
      shift
      ;;
    *)
      shift
      ;;
  esac
done

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_PY="$BACKEND_DIR/.venv/bin/python"
REQ_FILE="$BACKEND_DIR/requirements.txt"

echo ""
echo "=== Antigravity Pulse ==="
echo "Workspace: $ROOT_DIR"

PYTHON_BIN="python3"
if ! command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [[ ! -x "$VENV_PY" ]]; then
  echo "[1/4] Creating Python virtual environment..."
  "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
  "$VENV_PY" -m pip install --upgrade pip
  "$VENV_PY" -m pip install -r "$REQ_FILE"
else
  echo "[1/4] Python venv ready: $VENV_PY"
fi

DIST_INDEX="$FRONTEND_DIR/dist/index.html"
PKG_JSON="$FRONTEND_DIR/package.json"
if [[ "$SKIP_BUILD" != "1" && -f "$PKG_JSON" && ! -f "$DIST_INDEX" ]]; then
  echo "[2/4] Building mobile PWA frontend..."
  pushd "$FRONTEND_DIR" >/dev/null
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    npm install
  fi
  npm run build
  popd >/dev/null
elif [[ -f "$DIST_INDEX" ]]; then
  echo "[2/4] Frontend PWA bundle ready: $DIST_INDEX"
else
  echo "[2/4] Frontend dist not built yet (API-only mode until built)."
fi

export AGY_HOST="$HOST_ADDR"
export AGY_PORT="$PORT"
export PYTHONUTF8="1"

echo "[3/4] Initializing pairing credentials & network info..."
pushd "$BACKEND_DIR" >/dev/null
"$VENV_PY" -m app.cli_banner || true
popd >/dev/null

TUNNEL_PID=""
cleanup() {
  if [[ -n "$TUNNEL_PID" ]] && kill -0 "$TUNNEL_PID" >/dev/null 2>&1; then
    kill "$TUNNEL_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [[ "$USE_TUNNEL" == "1" ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    TUNNEL_LOG="${TMPDIR:-/tmp}/antigravity-pulse-tunnel-${PORT}.log"
    rm -f "$TUNNEL_LOG"
    cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!
    echo "[Tunnel] Starting Cloudflare Quick Tunnel (log: $TUNNEL_LOG)..."
    for _ in $(seq 1 25); do
      if [[ -f "$TUNNEL_LOG" ]]; then
        FOUND_URL="$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n1 || true)"
        if [[ -n "$FOUND_URL" ]]; then
          echo "[Tunnel] Public URL: $FOUND_URL"
          break
        fi
      fi
      sleep 0.4
    done
  else
    echo "[Tunnel] cloudflared not found. Install via: brew install cloudflared (macOS)"
  fi
fi

echo "[4/4] Starting FastAPI server on http://${HOST_ADDR}:${PORT} ..."
cd "$BACKEND_DIR"
exec "$VENV_PY" -m uvicorn app.main:app --host "$HOST_ADDR" --port "$PORT"
