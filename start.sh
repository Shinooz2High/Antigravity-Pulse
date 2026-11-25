#!/usr/bin/env bash
set -euo pipefail

PORT="${AGY_PORT:-8765}"
HOST_ADDR="${AGY_HOST:-0.0.0.0}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
VENV_DIR="$BACKEND_DIR/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"
REQ_FILE="$BACKEND_DIR/requirements.txt"

export PYTHONUTF8=1
if [ -d "$HOME/.gemini/bin" ]; then
  export PATH="$HOME/.gemini/bin:$PATH"
fi

echo ""
echo "=== Antigravity Pulse (macOS / Linux) ==="
echo "Workspace: $ROOT_DIR"

if [ ! -x "$VENV_PYTHON" ]; then
  echo "[1/4] Creating Python virtual environment..."
  python3 -m venv "$VENV_DIR"
  "$VENV_PYTHON" -m pip install --upgrade pip
  "$VENV_PYTHON" -m pip install -r "$REQ_FILE"
else
  echo "[1/4] Python venv ready: $VENV_PYTHON"
fi

if [ -f "$FRONTEND_DIR/package.json" ] && [ ! -f "$FRONTEND_DIR/dist/index.html" ]; then
  echo "[2/4] Building PWA frontend..."
  (
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
      npm install
    fi
    npm run build
  )
elif [ -f "$FRONTEND_DIR/dist/index.html" ]; then
  echo "[2/4] Frontend PWA bundle ready: $FRONTEND_DIR/dist/index.html"
else
  echo "[2/4] Frontend dist not built yet (API-only mode)."
fi

export AGY_HOST="$HOST_ADDR"
export AGY_PORT="$PORT"

echo "[3/4] Initializing pairing credentials & network info..."
(
  cd "$BACKEND_DIR"
  "$VENV_PYTHON" -m app.cli_banner
)

echo "[4/4] Starting Antigravity Pulse server on http://$HOST_ADDR:$PORT ..."
cd "$BACKEND_DIR"
exec "$VENV_PYTHON" -m uvicorn app.main:app --host "$HOST_ADDR" --port "$PORT"
