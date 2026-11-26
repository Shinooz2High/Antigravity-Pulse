#!/usr/bin/env bash
set -euo pipefail

# Antigravity Pulse — 1-Click macOS / Linux Installer
# Run: curl -fsSL https://agypulse.dpdns.org/install.sh | bash

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.gemini/bin:$PATH"

REPO_URL="https://github.com/Shinooz2High/App-Antigravity-on-moblie-.git"
ZIP_URL="https://github.com/Shinooz2High/App-Antigravity-on-moblie-/archive/refs/heads/main.zip"
INSTALL_DIR="$HOME/AntigravityPulse"
OS_NAME="$(uname -s)"

echo ""
echo "=================================================="
echo "  ANTIGRAVITY PULSE — 1-CLICK INSTALLER ($OS_NAME) "
echo "=================================================="
echo ""

install_with_pkg_mgr() {
  local cmd="$1"
  local brew_pkg="$2"
  local apt_pkg="$3"

  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[OK] $cmd ready ($(command -v "$cmd"))"
    return 0
  fi

  if [[ "$OS_NAME" == "Darwin" ]]; then
    if command -v brew >/dev/null 2>&1; then
      echo "[...] Installing $brew_pkg via Homebrew..."
      brew install "$brew_pkg" || true
    else
      echo "[!] $cmd not found. Install Homebrew (https://brew.sh) then run: brew install $brew_pkg"
    fi
  else
    if command -v apt-get >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
      echo "[...] Installing $apt_pkg via apt-get..."
      sudo apt-get update -y && sudo apt-get install -y "$apt_pkg" || true
    elif command -v dnf >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
      sudo dnf install -y "$apt_pkg" || true
    elif command -v pacman >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
      sudo pacman -S --noconfirm "$apt_pkg" || true
    fi
  fi

  if command -v "$cmd" >/dev/null 2>&1; then
    echo "[OK] Installed $cmd!"
    return 0
  fi
  return 1
}

install_with_pkg_mgr "python3" "python@3.12" "python3" || true
install_with_pkg_mgr "node" "node" "nodejs" || true
install_with_pkg_mgr "cloudflared" "cloudflared" "cloudflared" || true
HAS_GIT=0
if install_with_pkg_mgr "git" "git" "git"; then
  HAS_GIT=1
fi

if [[ "$HAS_GIT" == "1" ]]; then
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "[...] Updating Antigravity Pulse in $INSTALL_DIR..."
    git -C "$INSTALL_DIR" pull --ff-only origin main
  else
    rm -rf "$INSTALL_DIR"
    echo "[...] Cloning Antigravity Pulse into $INSTALL_DIR..."
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
else
  echo "[...] Downloading source archive into $INSTALL_DIR..."
  TMP_ZIP="${TMPDIR:-/tmp}/agypulse-main.zip"
  TMP_EXT="${TMPDIR:-/tmp}/agypulse-extract"
  curl -fsSL "$ZIP_URL" -o "$TMP_ZIP"
  rm -rf "$TMP_EXT"
  mkdir -p "$TMP_EXT"
  unzip -q "$TMP_ZIP" -d "$TMP_EXT"
  INNER_DIR="$(find "$TMP_EXT" -mindepth 1 -maxdepth 1 -type d | head -n1)"
  rm -rf "$INSTALL_DIR"
  mv "$INNER_DIR" "$INSTALL_DIR"
  rm -f "$TMP_ZIP"
fi

chmod +x "$INSTALL_DIR/start.sh"

# Create macOS .app bundle + Desktop double-click launcher
if [[ "$OS_NAME" == "Darwin" ]]; then
  APP_DIR="$HOME/Applications/Antigravity Pulse.app"
  mkdir -p "$APP_DIR/Contents/MacOS"
  cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>AntigravityPulse</string>
  <key>CFBundleIdentifier</key>
  <string>ai.antigravity.pulse.desktop</string>
  <key>CFBundleName</key>
  <string>Antigravity Pulse</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>2.0.0</string>
</dict>
</plist>
PLIST
  cat > "$APP_DIR/Contents/MacOS/AntigravityPulse" <<LAUNCHER
#!/usr/bin/env bash
osascript -e 'tell application "Terminal" to do script "cd \"$HOME/AntigravityPulse\" && ./start.sh"' -e 'tell application "Terminal" to activate'
LAUNCHER
  chmod +x "$APP_DIR/Contents/MacOS/AntigravityPulse"
  echo "[OK] Created macOS App: $APP_DIR"

  if [[ -d "$HOME/Desktop" ]]; then
    DESKTOP_CMD="$HOME/Desktop/Antigravity Pulse.command"
    cat > "$DESKTOP_CMD" <<CMDFILE
#!/usr/bin/env bash
cd "$INSTALL_DIR"
exec ./start.sh
CMDFILE
    chmod +x "$DESKTOP_CMD"
    echo "[OK] Created Desktop shortcut: $DESKTOP_CMD"
  fi
fi

echo ""
echo "[OK] Installation complete at $INSTALL_DIR"
if [[ "${AGY_NO_AUTOSTART:-0}" == "1" ]]; then
  exit 0
fi

cd "$INSTALL_DIR"
exec ./start.sh
