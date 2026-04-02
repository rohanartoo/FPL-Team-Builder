#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# FPL Season Archive Script
# Run once after GW38 to snapshot the season for Bayesian
# blending in the next campaign.
# ─────────────────────────────────────────────────────────

PORT=3000
BASE="http://localhost:$PORT"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    echo ""
    echo "Shutting down server (PID $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "═══════════════════════════════════════════════"
echo "  FPL Season Archive"
echo "═══════════════════════════════════════════════"
echo ""

# ── Phase 1: Start Server ────────────────────────────────

# Check if server is already running
if curl -s "$BASE/api/fpl/bootstrap" > /dev/null 2>&1; then
  echo "Server already running on port $PORT."
else
  echo "Starting server..."
  npx tsx server.ts &
  SERVER_PID=$!

  # Wait for server to be ready
  echo -n "Waiting for server"
  for i in $(seq 1 30); do
    if curl -s "$BASE/api/fpl/bootstrap" > /dev/null 2>&1; then
      echo " ready."
      break
    fi
    echo -n "."
    sleep 2
  done

  if ! curl -s "$BASE/api/fpl/bootstrap" > /dev/null 2>&1; then
    echo ""
    echo "ERROR: Server failed to start after 60s."
    exit 1
  fi
fi

# ── Phase 2: Wait for Cache Sync ─────────────────────────

echo ""
echo "Waiting for player summary cache to fully sync..."
echo "(This can take 2-3 minutes on first run)"
echo ""

while true; do
  SYNC_DATA=$(curl -s "$BASE/api/fpl/all-summaries")
  IS_SYNCING=$(echo "$SYNC_DATA" | python3 -c "import sys,json; print(json.load(sys.stdin).get('isSyncing', True))" 2>/dev/null)
  LOADED=$(echo "$SYNC_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('progress',{}).get('loaded',0))" 2>/dev/null)
  TOTAL=$(echo "$SYNC_DATA" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('progress',{}).get('total',0))" 2>/dev/null)

  if [[ "$IS_SYNCING" == "False" ]]; then
    echo "Cache sync complete: $LOADED / $TOTAL players loaded."
    break
  fi

  echo "  Syncing... $LOADED / $TOTAL"
  sleep 5
done

# ── Phase 3: Run Archive ─────────────────────────────────

echo ""
echo "Running archive..."
ARCHIVE_RESPONSE=$(curl -s -X POST "$BASE/api/fpl/archive-season")

SUCCESS=$(echo "$ARCHIVE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success', False))" 2>/dev/null)
SEASON=$(echo "$ARCHIVE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('season', 'unknown'))" 2>/dev/null)
ARCHIVED=$(echo "$ARCHIVE_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('playersArchived', 0))" 2>/dev/null)

if [[ "$SUCCESS" != "True" ]]; then
  echo "ERROR: Archive failed."
  echo "$ARCHIVE_RESPONSE"
  exit 1
fi

echo ""
echo "Archive successful!"
echo "  Season:   $SEASON"
echo "  Players:  $ARCHIVED"

# ── Phase 4: Verify ──────────────────────────────────────

if [[ ! -f "season_priors.json" ]]; then
  echo "ERROR: season_priors.json not found after archive."
  exit 1
fi

FILE_PLAYERS=$(python3 -c "import json; d=json.load(open('season_priors.json')); print(len(d.get('players',{})))" 2>/dev/null)
echo "  Verified: season_priors.json contains $FILE_PLAYERS player records."

DIFF=$((ARCHIVED - FILE_PLAYERS))
if [[ ${DIFF#-} -gt 10 ]]; then
  echo "WARNING: Player count mismatch (archived: $ARCHIVED, file: $FILE_PLAYERS)."
  echo "The cache may have been incomplete. Consider re-running."
  exit 1
fi

# ── Phase 4b: Clean Up Season-Specific Caches ───────────

if [[ -f "injury_periods.json" ]]; then
  echo "Removing injury_periods.json (will rebuild next season automatically)..."
  rm injury_periods.json
fi

# ── Phase 5: Deploy to Main ──────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo "  Ready to deploy to main"
echo "═══════════════════════════════════════════════"
echo ""

CURRENT_BRANCH=$(git branch --show-current)

echo "Current branch: $CURRENT_BRANCH"
echo "This will:"
echo "  1. Switch to main and pull latest"
echo "  2. Force-add season_priors.json"
echo "  3. Commit: \"Archive $SEASON Season\""
echo "  4. Push to origin (triggers Render deploy)"
echo ""

read -rp "Proceed? (y/n) " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "Aborted. season_priors.json is saved locally — you can deploy manually."
  exit 0
fi

# Stash any uncommitted work if switching branches
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  STASHED=false
  if [[ -n $(git status --porcelain) ]]; then
    echo "Stashing uncommitted changes on $CURRENT_BRANCH..."
    git stash push -m "archive-season: auto-stash before switching to main"
    STASHED=true
  fi
fi

git checkout main
git pull origin main

# Copy the file (it was generated on the previous branch)
git add -f season_priors.json
git commit -m "Archive $SEASON Season: Historical Seeding for Next Season"
git push origin main

echo ""
echo "Deployed to main. Render will auto-deploy."

# Return to original branch
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  git checkout "$CURRENT_BRANCH"
  if [[ "$STASHED" == "true" ]]; then
    echo "Restoring stashed changes on $CURRENT_BRANCH..."
    git stash pop
  fi
fi

echo ""
echo "Done. The new season will blend this data from GW1."
