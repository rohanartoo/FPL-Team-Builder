#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# FPL Season Archive
# Run once after GW38 to snapshot the season for Bayesian
# blending in the next campaign.
#
# Usage: npm run archive-season
# ─────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════"
echo "  FPL Season Archive"
echo "═══════════════════════════════════════════════"
echo ""

# ── Phase 1: Run the archive script ──────────────────────

npx tsx scripts/archive-season.ts

# ── Phase 2: Verify output ────────────────────────────────

if [[ ! -f "season_priors.json" ]]; then
  echo "ERROR: season_priors.json not found after archive."
  exit 1
fi

FILE_PLAYERS=$(python3 -c "import json; d=json.load(open('season_priors.json')); print(len(d.get('players',{})))" 2>/dev/null)
echo ""
echo "Verified: season_priors.json contains $FILE_PLAYERS player records."

# ── Phase 3: Clean up season-specific caches ─────────────

if [[ -f "injury_periods.json" ]]; then
  echo "Removing injury_periods.json (will rebuild next season automatically)..."
  rm injury_periods.json
fi

# ── Phase 4: Deploy to main ───────────────────────────────

echo ""
echo "═══════════════════════════════════════════════"
echo "  Ready to deploy to main"
echo "═══════════════════════════════════════════════"
echo ""

SEASON=$(python3 -c "import json; print(json.load(open('season_priors.json'))['season'])" 2>/dev/null)
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

STASHED=false
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  if [[ -n $(git status --porcelain) ]]; then
    echo "Stashing uncommitted changes on $CURRENT_BRANCH..."
    git stash push -m "archive-season: auto-stash before switching to main"
    STASHED=true
  fi
fi

git checkout main
git pull origin main
git add -f season_priors.json
git commit -m "Archive $SEASON Season: Historical Seeding for Next Season"
git push origin main

echo ""
echo "Deployed to main. Render will auto-deploy."

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  git checkout "$CURRENT_BRANCH"
  if [[ "$STASHED" == "true" ]]; then
    echo "Restoring stashed changes on $CURRENT_BRANCH..."
    git stash pop
  fi
fi

echo ""
echo "Done. The new season will blend this data from GW1."
