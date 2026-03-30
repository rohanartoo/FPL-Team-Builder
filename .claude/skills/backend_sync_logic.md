---
name: Backend Architecture & Sync
description: Use this when debugging the disk cache, modifying the rate limit, or understanding the season archive pipeline.
---

# Backend Sync & Archive Architecture

## 1. Background Summary Cache (`server.ts`)
To avoid IP bans from the FPL API, the Express server maintains a local disk cache (`player_summaries_cache.json`).
* **Trigger:** Runs sequentially on boot if `player_summaries_cache.json` is missing or if the `lastSyncCompleted` timestamp is older than 12 hours.
* **Loop:** Re-syncs every 12 hours automatically in the background (`syncAllPlayers`).
* **Rate Limits:** Fetches massive summary payloads iteratively with a strict `100ms` delay between requests (~10 req/sec). **Do not remove or arbitrarily lower this delay.**

## 2. Season Archiving Strategy (Phase 3)
The `POST /api/fpl/archive-season` endpoint prevents "cold start" rating issues at the beginning of a fresh FPL season by heavily processing the ending season metrics and saving them to `season_priors.json`.

The pipeline executes in this strict order:
1. Fetches current bootstrap teams & all 380 fixtures.
2. Calculates live standings based on home/away attack & defense form logic.
3. Generates a normalized Team Fixture Difficulty Rating (`TFDR` map).
4. Feeds the `TFDR` map into `calculatePerformanceProfile()` to distill every player's cached history into `Base PP90`, `Reliability Score`, `Efficiency Rating`, and `Archetype`.
5. Commits the final processed payload to the lightweight `season_priors.json` block for the frontend to consume.
