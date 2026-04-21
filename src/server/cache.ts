import path from "path";
import type { InjuryRecord, InjuryPeriodsCache } from "../types";
import {
  detectExcusedMatches
} from "../utils/metrics";

export const FPL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

export const CACHE_FILE = path.join(process.cwd(), "player_summaries_cache.json");
export const INJURY_PERIODS_FILE = path.join(process.cwd(), "injury_periods.json");

export const playerSummariesCache: Record<number, any> = {};
export let lastSyncCompleted: string | null = null;
export let isSyncing = false;
export let syncProgress = { loaded: 0, total: 0 };
export let injuryPeriodsCache: InjuryPeriodsCache = { season: '', lastUpdated: '', players: {} };

export function setLastSyncCompleted(val: string | null) { lastSyncCompleted = val; }
export function setIsSyncing(val: boolean) { isSyncing = val; }
export function setInjuryPeriodsCache(val: InjuryPeriodsCache) { injuryPeriodsCache = val; }

export async function loadCacheFromDisk() {
  const fs = await import("fs");
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cachedData = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(cachedData);
      if (parsed.summaries && parsed.lastSync) {
        Object.assign(playerSummariesCache, parsed.summaries);
        lastSyncCompleted = parsed.lastSync;
      } else {
        Object.assign(playerSummariesCache, parsed);
        lastSyncCompleted = new Date(0).toISOString();
      }
      console.log(`Loaded ${Object.keys(playerSummariesCache).length} player summaries from disk cache.`);
    }
  } catch (err) {
    console.error("Failed to load disk cache:", err);
  }
}

export async function loadInjuryPeriodsFromDisk() {
  const fs = await import("fs");
  try {
    if (fs.existsSync(INJURY_PERIODS_FILE)) {
      const raw = fs.readFileSync(INJURY_PERIODS_FILE, "utf-8");
      injuryPeriodsCache = JSON.parse(raw);
      const playerCount = Object.keys(injuryPeriodsCache.players).length;
      console.log(`Loaded injury periods for ${playerCount} players from disk (season: ${injuryPeriodsCache.season}).`);
    }
  } catch (err) {
    console.error("Failed to load injury periods cache:", err);
  }
}

export async function updateInjuryPeriods() {
  const fs = await import("fs");
  try {
    console.log("Updating injury periods...");
    const [bootstrapRes, fixturesRes] = await Promise.all([
      fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS }),
      fetch("https://fantasy.premierleague.com/api/fixtures/", { headers: FPL_HEADERS })
    ]);
    if (!bootstrapRes.ok || !fixturesRes.ok) {
      console.error("Injury periods update skipped: could not fetch bootstrap/fixtures.");
      return;
    }

    const bootstrapData = await bootstrapRes.json();
    const allFixtures: any[] = await fixturesRes.json();
    const allPlayers: any[] = bootstrapData.elements;

    const seasonYear = bootstrapData.events?.[0]?.deadline_time?.substring(0, 4) || new Date().getFullYear().toString();
    const currentSeason = `${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)}`;

    if (injuryPeriodsCache.season && injuryPeriodsCache.season !== currentSeason) {
      console.log(`New season detected (${currentSeason}). Resetting injury periods.`);
      injuryPeriodsCache = { season: currentSeason, lastUpdated: '', players: {} };
    } else if (!injuryPeriodsCache.season) {
      injuryPeriodsCache.season = currentSeason;
    }

    const fixtureToGW: Record<number, number> = {};
    for (const f of allFixtures) {
      if (f.id && f.event) fixtureToGW[f.id] = f.event;
    }

    const currentGW: number = bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id
      || 1;

    const isSuspensionGap = (history: any[], gapStartIdx: number, playerYellows: number): boolean => {
      if (gapStartIdx === 0) return false;
      const matchBefore = history[gapStartIdx - 1];
      if ((matchBefore.red_cards ?? 0) > 0) return true;
      const gapLength = (() => {
        let len = 0;
        for (let i = gapStartIdx; i < history.length && history[i].minutes === 0; i++) len++;
        return len;
      })();
      if (gapLength === 1 && (playerYellows === 5 || playerYellows === 10 || playerYellows === 15)) return true;
      return false;
    };

    let updatedCount = 0;

    for (const player of allPlayers) {
      const summary = playerSummariesCache[player.id];
      if (!summary || !Array.isArray(summary.history) || summary.history.length === 0) continue;

      const history: any[] = summary.history;
      const playerYellows: number = player.yellow_cards ?? 0;
      const existing: InjuryRecord[] = injuryPeriodsCache.players[player.id] ?? [];

      const excusedIndices = detectExcusedMatches(history, player.status);

      const runs: number[][] = [];
      let currentRun: number[] = [];
      for (let i = 0; i < history.length; i++) {
        if (excusedIndices.has(i) && history[i].minutes === 0) {
          currentRun.push(i);
        } else {
          if (currentRun.length > 0) { runs.push(currentRun); currentRun = []; }
        }
      }
      if (currentRun.length > 0) runs.push(currentRun);

      for (const run of runs) {
        const firstIdx = run[0];
        const lastIdx = run[run.length - 1];

        if (isSuspensionGap(history, firstIdx, playerYellows)) continue;

        const startGW = fixtureToGW[history[firstIdx].fixture];
        if (!startGW) continue;

        let endGW: number | null = null;
        for (let i = lastIdx + 1; i < history.length; i++) {
          if (history[i].minutes > 0) {
            endGW = fixtureToGW[history[i].fixture] ?? null;
            break;
          }
        }

        const alreadyExists = existing.some(p =>
          p.start_event === startGW && (p.end_event === endGW || (p.end_event === null && endGW === null))
        );

        const openIdx = existing.findIndex(p => p.start_event === startGW && p.end_event === null);
        if (openIdx !== -1 && endGW !== null) {
          existing[openIdx].end_event = endGW;
          updatedCount++;
        } else if (!alreadyExists) {
          existing.push({ start_event: startGW, end_event: endGW });
          updatedCount++;
        }
      }

      if (player.status === 'i') {
        const recentStarts = history.slice(-5).filter((m: any) => m.minutes >= 60).length;
        const isRegularStarter = recentStarts >= 3;
        if (isRegularStarter) {
          const alreadyOpen = existing.some(p => p.end_event === null);
          if (!alreadyOpen) {
            existing.push({ start_event: currentGW, end_event: null });
            updatedCount++;
          }
        }
      }

      if (existing.length > 0) {
        injuryPeriodsCache.players[player.id] = existing;
      }
    }

    injuryPeriodsCache.lastUpdated = new Date().toISOString();

    try {
      fs.writeFileSync(INJURY_PERIODS_FILE, JSON.stringify(injuryPeriodsCache, null, 2));
      const totalPlayers = Object.keys(injuryPeriodsCache.players).length;
      console.log(`Injury periods updated: ${updatedCount} new/updated records across ${totalPlayers} players.`);
    } catch (saveErr) {
      console.error("Failed to save injury periods to disk:", saveErr);
    }
  } catch (err) {
    console.error("Error updating injury periods:", err);
  }
}

export async function syncAllPlayers() {
  if (isSyncing) return;
  isSyncing = true;
  const fs = await import("fs");
  try {
    console.log("Starting FPL player summaries background sync...");
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap for sync");
    const bootstrapData = await bootstrapRes.json();
    const players = bootstrapData.elements;
    syncProgress.total = players.length;

    for (const player of players) {
      try {
        const summaryRes = await fetch(`https://fantasy.premierleague.com/api/element-summary/${player.id}/`, { headers: FPL_HEADERS });
        const contentType = summaryRes.headers.get("content-type") || "";
        if (summaryRes.ok && contentType.includes("application/json")) {
          const data = await summaryRes.json();
          if (data && Array.isArray(data.history)) {
            playerSummariesCache[player.id] = data;
            syncProgress.loaded = Object.keys(playerSummariesCache).length;
          }
        }
      } catch (err) {
        console.error(`Failed to fetch summary for player ${player.id}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }

    console.log("FPL player summaries sync complete. Saving to disk...");
    try {
      lastSyncCompleted = new Date().toISOString();
      fs.writeFileSync(CACHE_FILE, JSON.stringify({ lastSync: lastSyncCompleted, summaries: playerSummariesCache }));
    } catch (saveErr) {
      console.error("Failed to save cache to disk:", saveErr);
    }

    await updateInjuryPeriods();
  } catch (err) {
    console.error("Error during background sync", err);
  } finally {
    isSyncing = false;
  }
}
