#!/bin/bash

# FPL Form & Fixture Analyzer — Portable Launcher
# Works for anyone who has Node.js installed.
# Place this file inside the project folder. A Desktop symlink will work fine.

# ── Resolve symlinks so a Desktop shortcut still finds the project ─────────────
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  SOURCE="$(readlink "$SOURCE")"
done
PROJECT_DIR="$( cd "$( dirname "$SOURCE" )" && pwd )"

# ── Sanity check: make sure we found the right folder ────────────────────────
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo ""
  echo "❌ Could not find package.json in: $PROJECT_DIR"
  echo ""
  echo "Make sure this launcher file (FPL Analyzer.command) is inside"
  echo "the FPL-Team-Builder project folder, then try again."
  echo ""
  read -rp "Press Enter to exit..."
  exit 1
fi

# ── Load common shell profiles so nvm / Homebrew node is available ────────────
for profile in "$HOME/.nvm/nvm.sh" "$HOME/.profile" "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -s "$profile" ] && source "$profile" 2>/dev/null
done
[ -f "/opt/homebrew/bin/brew" ] && eval "$(/opt/homebrew/bin/brew shellenv)"
[ -f "/usr/local/bin/brew" ]    && eval "$(/usr/local/bin/brew shellenv)"

# ── Check Node.js is available ────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo ""
  echo "❌ Node.js not found."
  echo ""
  echo "Please install it from https://nodejs.org (LTS version), then try again."
  echo ""
  read -rp "Press Enter to exit..."
  exit 1
fi

echo ""
echo "✅ Node $(node -v) detected"
echo "📂 Project: $PROJECT_DIR"
echo ""

cd "$PROJECT_DIR"

# ── Install dependencies if node_modules is missing ──────────────────────────
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies (first run only)..."
  npm install || { echo "❌ npm install failed."; read -rp "Press Enter to exit..."; exit 1; }
  echo ""
fi

# ── Start the dev server ──────────────────────────────────────────────────────
echo "🚀 Starting FPL Analyzer..."
npm run dev &
SERVER_PID=$!

# ── Wait for the server to be ready ──────────────────────────────────────────
echo "⏳ Waiting for server..."
for i in {1..30}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

# ── Open in browser ───────────────────────────────────────────────────────────
echo "🌐 Opening http://localhost:3000..."
open http://localhost:3000

echo ""
echo "────────────────────────────────────"
echo "  FPL Analyzer is running!"
echo "  http://localhost:3000"
echo "  Press Ctrl+C to stop."
echo "────────────────────────────────────"
echo ""

wait $SERVER_PID
