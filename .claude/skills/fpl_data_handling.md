---
name: FPL Data Handling
description: Rules for interacting with FPL data and the local cache to conserve tokens.
---

# Instructions
1. **Never read the cache:** Under NO circumstances should you use file-reading tools on `player_summaries_cache.json` or `season_priors.json`.
2. **Rely on Types:** To understand the structure of FPL data, read `src/types.ts`. It contains `Player`, `Fixture`, and `PlayerSummary` interfaces. 
3. **Data Fetching:** If `src/types.ts` is insufficient and you must fetch live data from `https://fantasy.premierleague.com/api/` to understand a schema, you MUST pipe the output through `jq` to extract only the first object or the keys.
   - *Example:* `curl -s https://fantasy.premierleague.com/api/bootstrap-static/ | jq '.elements[0] | keys'`
4. **Mocking Data:** If you need to write tests or UI components, generate maximum 2 mocked objects based on `src/types.ts`. Do not extract real data from the cache.
