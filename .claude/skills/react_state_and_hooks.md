---
name: React State & Hooks
description: Strict guidelines for accessing FPL data within React components to prevent data hallucination and stale web data.
---

# Instructions

1. **NEVER Hallucinate FPL Data:** Under no circumstances should you use your internal training data, prior knowledge, or web searches to determine a player's price, points, fixtures, or team. FPL data changes constantly.
2. **Always Use Local App State:** You must exclusively rely on the app's React state and custom hooks to get player and team data. If a component needs data, ensure it is extracting it from the correct hook.
3. **Core Data Hooks Map:**
   - `useFPLData()` (`src/hooks/useFPLData.ts`): Raw live bootstrap data (all players, teams, and gameweek events) synced from the backend.
   - `useMyTeam()` (`src/hooks/useMyTeam.ts`): The user's specific roster, manager info, and chip strategy.
   - `useGlobalPerformanceRoster()` (`src/hooks/useGlobalPerformanceRoster.ts`): Deeply processed player metrics (TFDR, Form, Archetypes).
   - `enrichPlayer()` (`src/hooks/usePlayerEnrichment.ts`): Per-player enrichment utility (not a React hook — used internally by `useMyTeam` and server-side chat tools).
4. **No Direct Component Fetching:** Do not write `fetch()` calls inside UI components (`src/components/tabs/`) to get FPL data. The only acceptable exception is `MyTeamTab.tsx`'s POST to `/api/fpl/optimize` for Claude-based squad optimization. All other tabs must consume pre-processed data from the hooks above via `App.tsx`.
