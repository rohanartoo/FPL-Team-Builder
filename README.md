# FPL Team Builder

A Fantasy Premier League analytics engine that goes beyond FPL's native ratings. It calculates positional fixture difficulty, profiles player performance across difficulty tiers, projects expected points, and suggests transfers — all powered by live data from the official FPL API.

## What It Does

### TFDR Engine (Team Fixture Difficulty Rating v2.1)
FPL's built-in FDR is static and one-size-fits-all. TFDR replaces it with a positional, context-aware difficulty rating:
- **Positional split** — Defenders/goalkeepers are rated against the opponent's attack form; attackers/midfielders against their defensive form
- **Home/away context** — Separate ratings for home and away fixtures
- **Live standings** — Incorporates current-season league position and goal records
- **Percentile normalization** — All 20 teams are ranked and spread across a 1.5–5.5 scale per dimension

### Player Performance Profiler
Each player gets a detailed performance profile built from their match history:
- **PP90 by FDR bucket** — Points per 90 minutes against easy (FDR 2), medium (3), hard (4), and very hard (5) opponents
- **Reliability score** — Start rate and minutes consistency
- **Archetype classification** — Players are categorized as one of: Game Raiser, Consistent Performer, Steady Earner, Flat Track Bully, Low Performer, Rotation Risk, Squad Player, or Not Enough Data

### xPts Value Score
The headline metric used for rankings and transfer suggestions:
- **75% fixture-adjusted xPts** — Sums the player's PP90 at each upcoming fixture's difficulty over the next 5 GWs (double gameweeks count twice, blanks are skipped)
- **25% basement floor** — Season-long PPG as a stabilizer against small-sample noise
- **Reliability weighting** — Discounts rotation-prone or injury-affected players
- **Injury zeroing** — Parses FPL news text for return dates; long-term injuries (5+ weeks out) get a zero value score

### Season-Start Resilience
The app handles the cold-start problem at the beginning of each season:
- **Season archiving** — A `POST /api/fpl/archive-season` endpoint snapshots all player profiles, team standings, and TFDR maps at end of season
- **Bayesian blending** — Prior-season data decays linearly per player over their first 10 appearances (100% prior at 0 apps, 50/50 at 5 apps, fully organic by 10)
- **Gradual TFDR blend** — Prior-season TFDR map blends with live calculations from GW1 through GW8, avoiding a hard cutoff
- **Club-change detection** — Players who transferred clubs get discounted priors (FDR-bucketed scores discarded, base PP90 halved)
- **Price-based fallback** — When no history or prior exists, `now_cost / 20` serves as a last-resort PP90 estimate

## Tabs

| Tab | Description |
|---|---|
| **Player List** | Browse, filter, and sort all ~800 FPL players by value score, form, FDR, position, and price. Expandable rows show upcoming fixtures, performance profile, and archetype. |
| **Archetypes** | Explore players grouped by their archetype classification. |
| **Visualization** | Scatter chart plotting form against fixture difficulty to spot transfer targets visually. |
| **Schedules** | Compare upcoming fixture difficulty across all 20 teams with TFDR-based color coding and trend indicators. |
| **My Team** | Enter your FPL Team ID to analyze your squad. Identifies weak links and suggests budget-aware, position-matched, team-limit-respecting replacements. |
| **H2H Matchup** | Head-to-head comparison between your squad and an opponent's. Highlights common picks, differentials, and targeted transfer suggestions to gain an edge. |
| **Methodology** | In-app explanation of how the scoring engine works. |

## Run Locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

No API key required. The server proxies all data from the official Fantasy Premier League API and caches player summaries to disk.

## Architecture

- **Frontend:** React 19, Vite, Tailwind CSS, Recharts, Motion
- **Backend:** Express server that proxies FPL API requests, runs background player summary sync (~800 players at 10 req/s), and persists cache to disk
- **Deployment:** Designed for Render free tier with a 14-minute self-ping keep-alive

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | TypeScript type checking |
