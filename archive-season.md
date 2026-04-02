---
description: Comprehensive FPL Season Archive & Deployment
---

# Archiving the FPL Season

> Run once a year after GW38 to seed next season's Bayesian blending engine.
> This gives the app historical intelligence from day one of the new campaign.

---

## Running the Archive

**Timing:** After all GW38 matches are final. Before the FPL site resets (late June/July).

```bash
npm run archive-season
```

The script handles everything automatically:

1. Starts the server (or detects one already running)
2. Waits for the player summary cache to fully sync (~2-3 min)
3. Calls `POST /api/fpl/archive-season` and validates the response
4. Verifies `season_priors.json` was written with the correct player count
4b. Deletes `injury_periods.json` (it's season-specific; the server rebuilds it automatically in GW1 of the new season)
5. Switches to `main`, commits the file, and **asks you to confirm before pushing**

The push triggers a Render deploy. After that, the new season will use this data from GW1.

> **If you prefer to run the steps manually**, the script lives at
> [scripts/archive-season.sh](scripts/archive-season.sh) — each phase is clearly commented.

---

## What happens next season

The prior data decays automatically. No manual intervention needed.

### Player blending (per-player, based on appearances)

```
appearances    prior weight    current weight
──────────────────────────────────────────────
 0              100%            0%
 5              50%             50%
10+             0%              100%
```

Decay is based on **games actually played**, not gameweek number — a player who misses matches blends slower.

### TFDR map blending (global, based on finished fixtures)

```
fixtures       prior weight    live weight
──────────────────────────────────────────────
 0–9            100%            0%
 30 (~GW3)      ~71%            ~29%
 45 (~GW5)      ~50%            ~50%
 80+ (~GW8)     0%              100%
```

### Club transfers

Players who changed clubs between seasons get a discounted prior:
- FDR-bucketed PP90s are **discarded** (calibrated against a different schedule/squad)
- `base_pp90` is blended at **50% weight** (raw scoring ability travels, context doesn't)
- Archetype labels are preserved as stylistic hints only
