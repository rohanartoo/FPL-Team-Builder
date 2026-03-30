---
name: Local API Endpoints
description: Reference this skill when writing frontend data-fetching logic (like React hooks or API services). It maps out the available Express backend endpoints that proxy the FPL API.
---

# Local API Proxy Endpoints

The frontend should **NEVER** call `https://fantasy.premierleague.com` directly due to strict CORS policies. 
Always route requests through the local Express server at `http://localhost:3000` (or relative paths like `/api/fpl/...` in Vite).

## Available Endpoints (Base URL: `/api/fpl`)

### Core FPL Data
* `GET /api/fpl/bootstrap`
  * **Desc:** Returns the massive FPL bootstrap-static payload (all players, teams, events). Used to populate initial state.
* `GET /api/fpl/fixtures`
  * **Desc:** Returns all 380 fixtures for the season.

### Player Summaries
* `GET /api/fpl/player-summary/:id`
  * **Desc:** Returns history and upcoming fixtures for a specific player ID. Backed by the local `player_summaries_cache.json` to prevent rate-limiting.
* `GET /api/fpl/all-summaries`
  * **Desc:** Returns the background sync state, progress, and the entire payload of player summaries.

### User/Team Data (Entries)
* `GET /api/fpl/entry/:id`
  * **Desc:** Returns a specific user's basic FPL team info (e.g. manager name, overall rank).
* `GET /api/fpl/entry/:id/history`
  * **Desc:** Returns a user's gameweek history, past season history, and chips played.
* `GET /api/fpl/entry/:id/event/:event/picks`
  * **Desc:** Returns a user's 15 selected players and captaincy choices for a specific gameweek (event).

### Season Archiving & Resilience (Phase 3)
* `POST /api/fpl/archive-season`
  * **Desc:** Triggers the metric calculation engine (TFDR, Form, Archetypes) and saves the results to `season_priors.json`.
* `GET /api/fpl/season-priors`
  * **Desc:** Returns the archived seasonal data used for the "cold-start" degradation layer when fresh FPL data is sparse.

## Important Error Handling Note
Expect internal 503 errors if the actual FPL game is updating on their servers. Ensure the UI handles these gracefully without crashing, rather than endlessly attempting retries.
