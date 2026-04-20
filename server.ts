import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile,
  detectExcusedMatches
} from "./src/utils/metrics";
import type { InjuryRecord, InjuryPeriodsCache } from "./src/types";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  const FPL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  const CACHE_FILE = path.join(process.cwd(), "player_summaries_cache.json");
  const INJURY_PERIODS_FILE = path.join(process.cwd(), "injury_periods.json");
  const fs = await import("fs");

  // --- Background Cache Logic ---
  const playerSummariesCache: Record<number, any> = {};
  let lastSyncCompleted: string | null = null;
  let isSyncing = false;
  let syncProgress = { loaded: 0, total: 0 };

  // Load cache from disk if available
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cachedData = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(cachedData);

      // Handle both old flat format and new structured format
      if (parsed.summaries && parsed.lastSync) {
        Object.assign(playerSummariesCache, parsed.summaries);
        lastSyncCompleted = parsed.lastSync;
      } else {
        // Migration: Treat old format as just summaries with no timestamp
        Object.assign(playerSummariesCache, parsed);
        lastSyncCompleted = new Date(0).toISOString(); // Treat as very old
      }
      console.log(`Loaded ${Object.keys(playerSummariesCache).length} player summaries from disk cache.`);
    }
  } catch (err) {
    console.error("Failed to load disk cache:", err);
  }

  // --- Injury Periods Cache ---
  let injuryPeriodsCache: InjuryPeriodsCache = { season: '', lastUpdated: '', players: {} };

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
  // --- End Injury Periods Cache ---

  async function syncAllPlayers() {
    if (isSyncing) return;
    isSyncing = true;
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
        // Delay to respect rate limits (100ms = 10 requests/sec)
        await new Promise(r => setTimeout(r, 100));
      }
      console.log("FPL player summaries sync complete. Saving to disk...");
      try {
        lastSyncCompleted = new Date().toISOString();
        const dataToSave = {
          lastSync: lastSyncCompleted,
          summaries: playerSummariesCache
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(dataToSave));
      } catch (saveErr) {
        console.error("Failed to save cache to disk:", saveErr);
      }
      // Update injury periods after every sync
      await updateInjuryPeriods();
    } catch (err) {
      console.error("Error during background sync", err);
    } finally {
      isSyncing = false;
    }
  }

  // --- Injury Period Detection ---
  // Detects injury-only absence gaps from player history and persists them.
  // Suspensions (red cards, yellow accumulation) are explicitly excluded.
  async function updateInjuryPeriods() {
    try {
      console.log("Updating injury periods...");

      // Fetch bootstrap (player status + current GW) and fixtures (for GW mapping)
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

      // Detect current season from bootstrap (e.g., "2025-26")
      const seasonYear = bootstrapData.events?.[0]?.deadline_time?.substring(0, 4) || new Date().getFullYear().toString();
      const currentSeason = `${seasonYear}-${(parseInt(seasonYear) + 1).toString().slice(-2)}`;

      // Season reset: wipe data if a new season has started
      if (injuryPeriodsCache.season && injuryPeriodsCache.season !== currentSeason) {
        console.log(`New season detected (${currentSeason}). Resetting injury periods.`);
        injuryPeriodsCache = { season: currentSeason, lastUpdated: '', players: {} };
      } else if (!injuryPeriodsCache.season) {
        injuryPeriodsCache.season = currentSeason;
      }

      // Build a fixture-id → event (GW) lookup map
      const fixtureToGW: Record<number, number> = {};
      for (const f of allFixtures) {
        if (f.id && f.event) fixtureToGW[f.id] = f.event;
      }

      // Determine current GW
      const currentGW: number = bootstrapData.events?.find((e: any) => e.is_current)?.id
        || bootstrapData.events?.find((e: any) => e.is_next)?.id
        || 1;

      // Helper: is this gap likely a suspension?
      // Suspensions in the PL are triggered by a red card (immediate, 3-game ban)
      // or yellow card accumulation (5th/10th/15th yellow = 1-game ban).
      // We check the raw history entry before the gap for a red card.
      const isSuspensionGap = (history: any[], gapStartIdx: number, playerYellows: number): boolean => {
        if (gapStartIdx === 0) return false;
        const matchBefore = history[gapStartIdx - 1];
        // Red card in the match immediately before the gap → suspension
        if ((matchBefore.red_cards ?? 0) > 0) return true;
        // Yellow card accumulation: if the gap is exactly 1 game and the player
        // hit a 5/10/15 yellow threshold, treat as suspension.
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

        // --- Retrospective: detect completed injury gaps from history ---
        const excusedIndices = detectExcusedMatches(history, player.status);

        // Group consecutive excused indices into gap runs
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

        // Convert each run to a [start_event, end_event] pair, filtering suspensions
        for (const run of runs) {
          const firstIdx = run[0];
          const lastIdx = run[run.length - 1];

          // Skip suspensions
          if (isSuspensionGap(history, firstIdx, playerYellows)) continue;

          const startGW = fixtureToGW[history[firstIdx].fixture];
          if (!startGW) continue;

          // Find the return GW: first game after the gap where player got minutes
          let endGW: number | null = null;
          for (let i = lastIdx + 1; i < history.length; i++) {
            if (history[i].minutes > 0) {
              endGW = fixtureToGW[history[i].fixture] ?? null;
              break;
            }
          }

          // Check if this period already exists
          const alreadyExists = existing.some(p =>
            p.start_event === startGW && (p.end_event === endGW || (p.end_event === null && endGW === null))
          );

          // Close an open period if the player has returned
          const openIdx = existing.findIndex(p => p.start_event === startGW && p.end_event === null);
          if (openIdx !== -1 && endGW !== null) {
            existing[openIdx].end_event = endGW;
            updatedCount++;
          } else if (!alreadyExists) {
            existing.push({ start_event: startGW, end_event: endGW });
            updatedCount++;
          }
        }

        // --- Real-time: open a new period for a currently injured player ---
        if (player.status === 'i') {
          // Only open if the player was a regular starter (not just any injured player)
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
  // --- End Injury Period Detection ---

  // Start background sync if data is stale (> 12 hours) or missing
  const TWELVE_HOURS = 1000 * 60 * 60 * 12;
  const isStale = !lastSyncCompleted || (Date.now() - new Date(lastSyncCompleted).getTime() > TWELVE_HOURS);
  const isEmpty = Object.keys(playerSummariesCache).length === 0;

  if (isStale || isEmpty) {
    console.log(isEmpty ? "Cache is empty. Starting initial sync..." : "Cache is stale. Starting background sync...");
    syncAllPlayers();
  } else {
    console.log(`Cache is fresh (last sync: ${lastSyncCompleted}). Skip background sync.`);
  }

  // Repeat background sync every 12 hours
  setInterval(syncAllPlayers, TWELVE_HOURS);
  // --- End Background Cache Logic ---



  // FPL API Proxy Endpoints
  app.get("/api/fpl/bootstrap", async (req, res) => {
    try {
      const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching FPL bootstrap:", error);
      res.status(500).json({ error: "Failed to fetch FPL bootstrap data" });
    }
  });

  app.get("/api/fpl/fixtures", async (req, res) => {
    try {
      const response = await fetch("https://fantasy.premierleague.com/api/fixtures/", { headers: FPL_HEADERS });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error("Error fetching FPL fixtures:", error);
      res.status(500).json({ error: "Failed to fetch FPL fixtures data" });
    }
  });

  app.get("/api/fpl/player-summary/:id", async (req, res) => {
    const { id } = req.params;
    if (playerSummariesCache[Number(id)]) {
      return res.json(playerSummariesCache[Number(id)]);
    }
    try {
      const response = await fetch(`https://fantasy.premierleague.com/api/element-summary/${id}/`, { headers: FPL_HEADERS });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("application/json")) {
        return res.status(503).json({ error: "FPL API is temporarily unavailable (game being updated)." });
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.history)) {
        return res.status(503).json({ error: "FPL API returned invalid data." });
      }
      res.json(data);
    } catch (error) {
      console.error(`Error fetching FPL player summary for ${id}:`, error);
      res.status(500).json({ error: `Failed to fetch FPL player summary for ${id}` });
    }
  });

  app.get("/api/fpl/all-summaries", (req, res) => {
    res.json({
      isSyncing,
      progress: syncProgress,
      summaries: playerSummariesCache,
      lastSyncCompleted
    });
  });

  app.get("/api/fpl/injury-periods", (_req, res) => {
    res.json(injuryPeriodsCache);
  });

  app.get("/api/fpl/entry/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const response = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/`, { headers: FPL_HEADERS });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Could not find team. Check your ID." });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`Error fetching FPL entry for ${id}:`, error);
      res.status(500).json({ error: `Failed to fetch FPL entry for ${id}` });
    }
  });

  app.get("/api/fpl/entry/:id/history", async (req, res) => {
    const { id } = req.params;
    try {
      const response = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/history/`, { headers: FPL_HEADERS });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Could not find history for this entry." });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`Error fetching FPL history for ${id}:`, error);
      res.status(500).json({ error: `Failed to fetch FPL history for ${id}` });
    }
  });

  app.get("/api/fpl/entry/:id/event/:event/picks", async (req, res) => {
    const { id, event } = req.params;
    try {
      const response = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/event/${event}/picks/`, { headers: FPL_HEADERS });
      if (!response.ok) {
        return res.status(response.status).json({ error: "Could not find picks for this event." });
      }
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`Error fetching FPL picks for ${id} event ${event}:`, error);
      res.status(500).json({ error: `Failed to fetch FPL picks for ${id} event ${event}` });
    }
  });



  // --- AI Chat Endpoints ---
  const ENABLE_AI_CHAT = process.env.ENABLE_AI_CHAT === "true";
  const CHAT_ACCESS_PASSPHRASE = process.env.CHAT_ACCESS_PASSPHRASE || "";
  const CHAT_TOKEN_SECRET = process.env.CHAT_TOKEN_SECRET || "";
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

  // Rolling daily request counter (resets at midnight UTC)
  let chatRequestCount = 0;
  let chatCounterDate = new Date().toUTCString().split(" ").slice(0, 4).join(" ");
  const CHAT_SOFT_LIMIT = 1400;

  function resetCounterIfNewDay() {
    const today = new Date().toUTCString().split(" ").slice(0, 4).join(" ");
    if (today !== chatCounterDate) {
      chatRequestCount = 0;
      chatCounterDate = today;
    }
  }

  // --- Fuzzy Player Name Matching ---
  // Strips diacritics/accents so e.g. "Dubravka" matches "Dúbravka"
  function normalizePlayerName(s: string): string {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // Levenshtein edit distance between two strings
  function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  // Auto-match threshold: accept best match if edit distance <= this value
  const FUZZY_AUTO_THRESHOLD = 3;

  interface FuzzyPlayerResult {
    player: any | null;       // Best-matched player object (or null if no good match)
    exact: boolean;           // true = substring/normalised match; false = fuzzy auto-select
    candidates: any[];        // Top alternatives (used for disambiguation messaging)
  }

  // Finds the best FPL player match for a query, tolerating typos and accents.
  // Returns the matched player plus disambiguation info for the AI to relay.
  function fuzzyFindPlayer(query: string, players: any[]): FuzzyPlayerResult {
    const normQuery = normalizePlayerName(query);

    // 1. Normalised substring match (handles accents perfectly)
    const substringMatches = players.filter((p: any) => {
      const normWeb = normalizePlayerName(p.web_name);
      const normFull = normalizePlayerName(`${p.first_name} ${p.second_name}`);
      return normWeb.includes(normQuery) || normFull.includes(normQuery);
    });
    if (substringMatches.length === 1) return { player: substringMatches[0], exact: true, candidates: [] };
    if (substringMatches.length > 1) {
      // Multiple normalised matches — return best and list alternatives
      return { player: substringMatches[0], exact: true, candidates: substringMatches.slice(1, 4) };
    }

    // 2. Fuzzy Levenshtein fallback for typos
    const scored = players
      .map((p: any) => {
        const normWeb = normalizePlayerName(p.web_name);
        const normFull = normalizePlayerName(`${p.first_name} ${p.second_name}`);
        const dist = Math.min(levenshtein(normQuery, normWeb), levenshtein(normQuery, normFull));
        return { player: p, dist };
      })
      .sort((a, b) => a.dist - b.dist);

    const best = scored[0];
    if (best.dist <= FUZZY_AUTO_THRESHOLD) {
      // Auto-select with a note — close enough to be confident
      return { player: best.player, exact: false, candidates: scored.slice(1, 3).map(s => s.player) };
    }

    // 3. Nothing close — return suggestions only
    return { player: null, exact: false, candidates: scored.slice(0, 3).map(s => s.player) };
  }
  // --- End Fuzzy Player Name Matching ---

  function generateToken(passphrase: string): string {
    const expiry = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
    const payload = `${passphrase}:${expiry}`;
    const sig = crypto.createHmac("sha256", CHAT_TOKEN_SECRET).update(payload).digest("hex");
    return Buffer.from(`${expiry}:${sig}`).toString("base64");
  }

  function validateToken(token: string): boolean {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      const [expiryStr, sig] = decoded.split(":");
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() / 1000 > expiry) return false;
      const payload = `${CHAT_ACCESS_PASSPHRASE}:${expiry}`;
      const expected = crypto.createHmac("sha256", CHAT_TOKEN_SECRET).update(payload).digest("hex");
      return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  app.post("/api/chat/verify", (req, res) => {
    if (!ENABLE_AI_CHAT) return res.status(403).json({ error: "Chat feature is disabled." });
    const { passphrase } = req.body;
    if (!passphrase || passphrase !== CHAT_ACCESS_PASSPHRASE) {
      return res.status(401).json({ error: "Incorrect passphrase." });
    }
    const token = generateToken(passphrase);
    res.json({ token });
  });

  // --- Gemini tool functions ---
  async function toolGetPlayerStats({ position, maxCost, minForm }: { position?: string; maxCost?: number; minForm?: number }) {
    const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    const data = await response.json();
    const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    let players = data.elements as any[];
    if (position && positionMap[position.toUpperCase()]) {
      players = players.filter((p: any) => p.element_type === positionMap[position.toUpperCase()]);
    }
    if (maxCost) players = players.filter((p: any) => p.now_cost <= maxCost * 10);
    if (minForm) players = players.filter((p: any) => parseFloat(p.form) >= minForm);
    const teams: any[] = data.teams;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });
    return players.slice(0, 20).map((p: any) => {
      const mins = p.minutes || 1;
      return {
        name: p.web_name,
        team: teamMap[p.team] || p.team,
        position: ["", "GKP", "DEF", "MID", "FWD"][p.element_type],
        price: (p.now_cost / 10).toFixed(1),
        total_points: p.total_points,
        form: p.form,
        selected_by: p.selected_by_percent + "%",
        goals: p.goals_scored,
        assists: p.assists,
        bonus: p.bonus,
        minutes: p.minutes,
        xG_per_90: parseFloat(((parseFloat(p.expected_goals || "0") / mins) * 90).toFixed(2)),
        xA_per_90: parseFloat(((parseFloat(p.expected_assists || "0") / mins) * 90).toFixed(2)),
        xGI_per_90: parseFloat(((parseFloat(p.expected_goal_involvements || "0") / mins) * 90).toFixed(2)),
        chance_of_playing: p.chance_of_playing_next_round ?? 100,
        status: p.status
      };
    });
  }

  async function toolGetUpcomingFixtures({ teamName, games }: { teamName?: string; games?: number }) {
    const [bootstrapRes, fixturesRes] = await Promise.all([
      fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS }),
      fetch("https://fantasy.premierleague.com/api/fixtures/?future=1", { headers: FPL_HEADERS })
    ]);
    const bootstrap = await bootstrapRes.json();
    const fixtures: any[] = await fixturesRes.json();
    const teams: any[] = bootstrap.teams;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    let relevantTeamId: number | null = null;
    if (teamName) {
      const match = teams.find((t: any) =>
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        t.short_name.toLowerCase().includes(teamName.toLowerCase())
      );
      if (match) relevantTeamId = match.id;
    }

    let upcomingFixtures = fixtures.filter((f: any) => !f.finished);
    if (relevantTeamId) {
      upcomingFixtures = upcomingFixtures.filter((f: any) =>
        f.team_h === relevantTeamId || f.team_a === relevantTeamId
      );
    }

    return upcomingFixtures.slice(0, games ?? 5).map((f: any) => ({
      gameweek: f.event,
      home: teamMap[f.team_h],
      away: teamMap[f.team_a],
      difficulty_home: f.team_h_difficulty,
      difficulty_away: f.team_a_difficulty,
      kickoff: f.kickoff_time
    }));
  }

  async function toolAnalyzePlayer({ playerName }: { playerName: string }) {
    const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    const data = await response.json();
    const teams: any[] = data.teams;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.name; });

    const fuzzyResult = fuzzyFindPlayer(playerName, data.elements as any[]);
    if (!fuzzyResult.player) {
      const suggestions = fuzzyResult.candidates.map((p: any) => `${p.web_name} (${p.first_name} ${p.second_name})`).join(", ");
      return {
        error: `Player "${playerName}" not found.`,
        did_you_mean: suggestions ? `Did you mean one of these? ${suggestions}` : "No similar players found."
      };
    }
    const player = fuzzyResult.player;
    const autoMatchNote = !fuzzyResult.exact
      ? `Note: Showing results for "${player.web_name}" (auto-matched from "${playerName}").`
      : null;

    const summary = playerSummariesCache[player.id];
    const history: any[] = summary?.history ?? [];
    const recentHistory = history.slice(-5);

    // xG/xA per 90
    const mins = player.minutes || 1;
    const xG_per_90 = parseFloat(((parseFloat(player.expected_goals || "0") / mins) * 90).toFixed(2));
    const xA_per_90 = parseFloat(((parseFloat(player.expected_assists || "0") / mins) * 90).toFixed(2));
    const xGI_per_90 = parseFloat(((parseFloat(player.expected_goal_involvements || "0") / mins) * 90).toFixed(2));

    // Home/away splits from cache history
    const homeMatches = history.filter((h: any) => h.was_home && h.minutes > 0);
    const awayMatches = history.filter((h: any) => !h.was_home && h.minutes > 0);
    const splitStats = (matches: any[]) => {
      const totalMins = matches.reduce((s: number, h: any) => s + h.minutes, 0) || 1;
      const totalPts = matches.reduce((s: number, h: any) => s + h.total_points, 0);
      const totalXG = matches.reduce((s: number, h: any) => s + parseFloat(h.expected_goals || "0"), 0);
      const totalXA = matches.reduce((s: number, h: any) => s + parseFloat(h.expected_assists || "0"), 0);
      return {
        appearances: matches.length,
        pp90: parseFloat(((totalPts / totalMins) * 90).toFixed(2)),
        xG_per_90: parseFloat(((totalXG / totalMins) * 90).toFixed(2)),
        xA_per_90: parseFloat(((totalXA / totalMins) * 90).toFixed(2))
      };
    };

    // Last 5 games detail
    const last_5_form = recentHistory.map((h: any) => ({
      gw: h.round,
      venue: h.was_home ? "H" : "A",
      minutes: h.minutes,
      points: h.total_points,
      goals: h.goals_scored,
      assists: h.assists,
      bonus: h.bonus,
      xG: parseFloat(h.expected_goals || "0"),
      xA: parseFloat(h.expected_assists || "0"),
      clean_sheet: h.clean_sheets > 0
    }));

    // Reliability score from history
    const starterMatches = history.filter((h: any) => h.minutes >= 60).length;
    const reliability = history.length > 0
      ? parseFloat((starterMatches / history.length).toFixed(2))
      : null;

    return {
      name: player.web_name,
      full_name: `${player.first_name} ${player.second_name}`,
      team: teamMap[player.team],
      position: ["", "GKP", "DEF", "MID", "FWD"][player.element_type],
      price: (player.now_cost / 10).toFixed(1),
      total_points: player.total_points,
      form: player.form,
      points_per_game: player.points_per_game,
      selected_by: player.selected_by_percent + "%",
      goals: player.goals_scored,
      assists: player.assists,
      clean_sheets: player.clean_sheets,
      bonus: player.bonus,
      minutes: player.minutes,
      xG_per_90,
      xA_per_90,
      xGI_per_90,
      chance_of_playing_next_round: player.chance_of_playing_next_round ?? 100,
      status: player.status,
      news: player.news || "None",
      reliability_score: reliability,
      home_splits: splitStats(homeMatches),
      away_splits: splitStats(awayMatches),
      last_5_form,
      transfers_in_event: player.transfers_in_event,
      transfers_out_event: player.transfers_out_event,
      ...(autoMatchNote ? { auto_matched_from: autoMatchNote } : {})
    };
  }

  // Price predictions cache (2-hour TTL)
  let pricePredictionsCache: { data: any; fetchedAt: number } | null = null;
  const PRICE_CACHE_TTL = 1000 * 60 * 60 * 2;

  async function toolGetPriceChanges() {
    const now = Date.now();
    if (pricePredictionsCache && (now - pricePredictionsCache.fetchedAt) < PRICE_CACHE_TTL) {
      return pricePredictionsCache.data;
    }
    try {
      const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
      if (!res.ok) throw new Error(`FPL API returned ${res.status}`);
      const data = await res.json();
      const teams: any[] = data.teams;
      const teamMap: Record<number, string> = {};
      teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

      const players: any[] = data.elements;

      // Players with confirmed price rises this GW
      const risen = players
        .filter((p: any) => p.cost_change_event > 0)
        .sort((a: any, b: any) => b.cost_change_event - a.cost_change_event)
        .slice(0, 10)
        .map((p: any) => ({
          name: p.web_name,
          team: teamMap[p.team],
          current_price: (p.now_cost / 10).toFixed(1),
          price_change: `+${(p.cost_change_event / 10).toFixed(1)}`,
          net_transfers_this_gw: p.transfers_in_event - p.transfers_out_event
        }));

      // Players with confirmed price falls this GW
      const fallen = players
        .filter((p: any) => p.cost_change_event < 0)
        .sort((a: any, b: any) => a.cost_change_event - b.cost_change_event)
        .slice(0, 10)
        .map((p: any) => ({
          name: p.web_name,
          team: teamMap[p.team],
          current_price: (p.now_cost / 10).toFixed(1),
          price_change: (p.cost_change_event / 10).toFixed(1),
          net_transfers_this_gw: p.transfers_in_event - p.transfers_out_event
        }));

      // Most transferred in this GW (likely to rise soon)
      const trending_in = players
        .filter((p: any) => p.cost_change_event === 0)
        .sort((a: any, b: any) => (b.transfers_in_event - b.transfers_out_event) - (a.transfers_in_event - a.transfers_out_event))
        .slice(0, 10)
        .map((p: any) => ({
          name: p.web_name,
          team: teamMap[p.team],
          current_price: (p.now_cost / 10).toFixed(1),
          transfers_in: p.transfers_in_event,
          transfers_out: p.transfers_out_event,
          net_transfers: p.transfers_in_event - p.transfers_out_event
        }));

      const result = { risen_this_gw: risen, fallen_this_gw: fallen, trending_in_may_rise: trending_in, fetched_at: new Date().toISOString() };
      pricePredictionsCache = { data: result, fetchedAt: now };
      return result;
    } catch (err: any) {
      return { error: `Could not fetch price data: ${err.message}` };
    }
  }

  // Understat cache (24-hour TTL)
  let understatCache: { data: any[]; fetchedAt: number } | null = null;
  const UNDERSTAT_CACHE_TTL = 1000 * 60 * 60 * 24;

  async function getUnderstatPlayers(): Promise<any[]> {
    const now = Date.now();
    if (understatCache && (now - understatCache.fetchedAt) < UNDERSTAT_CACHE_TTL) {
      return understatCache.data;
    }
    const res = await fetch("https://understat.com/main/getPlayersStats/", {
      method: "POST",
      headers: { "User-Agent": "Mozilla/5.0", "Content-Type": "application/x-www-form-urlencoded" },
      body: "league=EPL&season=2024"
    });
    if (!res.ok) throw new Error(`Understat returned ${res.status}`);
    const json = await res.json() as any;
    const players: any[] = json.players ?? [];
    understatCache = { data: players, fetchedAt: now };
    return players;
  }

  async function toolGetDeepStats({ playerName }: { playerName: string }) {
    try {
      const players = await getUnderstatPlayers();

      // Build synthetic player objects compatible with fuzzyFindPlayer
      const syntheticPlayers = players.map((p: any) => ({
        id: p.id,
        web_name: p.player_name.split(" ").pop() ?? p.player_name,
        first_name: p.player_name.split(" ").slice(0, -1).join(" ") || p.player_name,
        second_name: p.player_name.split(" ").pop() ?? "",
        _raw: p
      }));

      const fuzzyResult = fuzzyFindPlayer(playerName, syntheticPlayers);
      if (!fuzzyResult.player) {
        const suggestions = fuzzyResult.candidates.map((p: any) => p._raw.player_name).join(", ");
        return {
          error: `No Understat data found for "${playerName}".`,
          did_you_mean: suggestions ? `Did you mean one of these? ${suggestions}` : "No similar players found."
        };
      }

      const match = fuzzyResult.player._raw;
      const autoMatchNote = !fuzzyResult.exact
        ? `Note: Showing deep stats for "${match.player_name}" (auto-matched from "${playerName}").`
        : null;

      const mins = parseFloat(match.time) || 1;
      const games = parseFloat(match.games) || 1;
      return {
        name: match.player_name,
        team: match.team_title,
        position: match.position,
        season: "2024-25",
        games: match.games,
        minutes: match.time,
        goals: match.goals,
        assists: match.assists,
        xG: parseFloat(match.xG).toFixed(2),
        xA: parseFloat(match.xA).toFixed(2),
        npxG: parseFloat(match.npxG).toFixed(2),
        xG_per_90: parseFloat(((parseFloat(match.xG) / mins) * 90).toFixed(2)),
        xA_per_90: parseFloat(((parseFloat(match.xA) / mins) * 90).toFixed(2)),
        npxG_per_90: parseFloat(((parseFloat(match.npxG) / mins) * 90).toFixed(2)),
        xGI_per_90: parseFloat((((parseFloat(match.xG) + parseFloat(match.xA)) / mins) * 90).toFixed(2)),
        xGChain_per_90: parseFloat(((parseFloat(match.xGChain) / mins) * 90).toFixed(2)),
        shots: match.shots,
        shots_per_game: parseFloat((parseFloat(match.shots) / games).toFixed(1)),
        key_passes: match.key_passes,
        key_passes_per_game: parseFloat((parseFloat(match.key_passes) / games).toFixed(1)),
        yellow_cards: match.yellow_cards,
        red_cards: match.red_cards,
        xG_overperformance: parseFloat((parseFloat(match.goals) - parseFloat(match.xG)).toFixed(2)),
        ...(autoMatchNote ? { auto_matched_from: autoMatchNote } : {})
      };
    } catch (err: any) {
      return { error: `Failed to fetch deep stats: ${err.message}` };
    }
  }

  async function toolGetInjuryNews({ teamName }: { teamName?: string }) {
    const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    const data = await response.json();
    const teams: any[] = data.teams;
    const teamMap: Record<number, string> = {};
    const teamNameMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; teamNameMap[t.id] = t.name; });

    let players: any[] = data.elements;

    if (teamName) {
      const match = teams.find((t: any) =>
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        t.short_name.toLowerCase().includes(teamName.toLowerCase())
      );
      if (match) players = players.filter((p: any) => p.team === match.id);
    }

    const statusLabel: Record<string, string> = {
      a: "Available", i: "Injured", d: "Doubtful", u: "Unavailable", s: "Suspended"
    };

    const flagged = players
      .filter((p: any) => p.status !== "a" || p.news)
      .map((p: any) => {
        const injuryHistory = injuryPeriodsCache.players[p.id] ?? [];
        const currentInjury = injuryHistory.find((r: any) => r.end_event === null);
        return {
          name: p.web_name,
          team: teamMap[p.team],
          status: statusLabel[p.status] || p.status,
          chance_of_playing_next_round: p.chance_of_playing_next_round ?? 100,
          news: p.news || "No news",
          injured_since_gw: currentInjury?.start_event ?? null
        };
      })
      .sort((a: any, b: any) => a.chance_of_playing_next_round - b.chance_of_playing_next_round);

    return {
      total_flagged: flagged.length,
      players: flagged,
      as_of: new Date().toISOString()
    };
  }

  // --- Gemini Retry + Model Fallback Helper ---
  // Primary: gemini-2.5-flash | Fallback: gemini-2.5-flash-lite
  // On 503/500 (transient): retries same model with exponential backoff (1s, 2s)
  // On 429 (quota exhausted): immediately cascades to the next model in the chain
  const GEMINI_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const MAX_RETRIES_PER_MODEL = 2;
  const BASE_BACKOFF_MS = 1000;

  async function generateWithFallback(
    ai: GoogleGenAI,
    contents: any[],
    config: any
  ): Promise<any> {
    let lastError: any;
    for (const model of GEMINI_MODEL_CHAIN) {
      for (let attempt = 1; attempt <= MAX_RETRIES_PER_MODEL; attempt++) {
        try {
          const response = await ai.models.generateContent({ model, contents, config });
          if (attempt > 1 || model !== GEMINI_MODEL_CHAIN[0]) {
            console.log(`[AI] Succeeded on model=${model} attempt=${attempt}`);
          }
          return response;
        } catch (err: any) {
          lastError = err;
          const status = err.status ?? err.statusCode;
          if (status === 503 || status === 500) {
            // Transient error — retry same model with backoff
            if (attempt < MAX_RETRIES_PER_MODEL) {
              const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
              console.warn(`[AI] Transient ${status} on model=${model} attempt=${attempt}. Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.warn(`[AI] Exhausted retries for model=${model}. Cascading to next model...`);
            }
          } else if (status === 429) {
            // Quota hit — skip remaining retries and cascade immediately
            console.warn(`[AI] Quota exhausted (429) for model=${model}. Cascading to next model immediately...`);
            break;
          } else {
            // Non-retryable error (e.g. 401 bad API key) — throw immediately
            throw err;
          }
        }
      }
    }
    // All models exhausted
    throw lastError;
  }
  // --- End Gemini Retry + Model Fallback Helper ---

  app.post("/api/chat", async (req, res) => {
    if (!ENABLE_AI_CHAT) return res.status(403).json({ error: "Chat feature is disabled." });

    resetCounterIfNewDay();
    if (chatRequestCount >= CHAT_SOFT_LIMIT) {
      return res.status(429).json({ error: "We've hit our free AI limit for today — check back tomorrow!" });
    }

    const token = req.headers["x-chat-token"] as string;
    if (!token || !validateToken(token)) {
      return res.status(401).json({ error: "Unauthorized. Please verify your passphrase." });
    }

    if (!GEMINI_API_KEY) return res.status(500).json({ error: "AI service not configured." });

    const { message, teamContext, history: chatHistory } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    chatRequestCount++;

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

      const tools = [
        {
          functionDeclarations: [
            {
              name: "getPlayerStats",
              description: "Get a ranked list of FPL players filtered by position, price, or form. Use to answer questions about best players, value picks, or ownership.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.STRING, description: "Position filter: GKP, DEF, MID, or FWD" },
                  maxCost: { type: Type.NUMBER, description: "Maximum price in millions (e.g. 6.5)" },
                  minForm: { type: Type.NUMBER, description: "Minimum form score (e.g. 6.0)" }
                }
              }
            },
            {
              name: "getUpcomingFixtures",
              description: "Get upcoming FPL fixtures, optionally filtered by team name. Use to assess fixture difficulty for transfer decisions.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  teamName: { type: Type.STRING, description: "Team name or short name (e.g. 'Arsenal', 'ARS')" },
                  games: { type: Type.NUMBER, description: "Number of upcoming fixtures to return (default 5)" }
                }
              }
            },
            {
              name: "analyzePlayer",
              description: "Get a deep profile of a specific player including xG/xA per 90, home/away splits, reliability score, and last 5 game breakdown. Use when asked about a specific player.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  playerName: { type: Type.STRING, description: "Player name or surname (e.g. 'Salah', 'Erling Haaland')" }
                },
                required: ["playerName"]
              }
            },
            {
              name: "getPriceChanges",
              description: "Get FPL players predicted to rise or fall in price soon, based on live transfer activity. Use when asked about price changes, who to buy before a rise, or who to sell before a fall.",
              parameters: {
                type: Type.OBJECT,
                properties: {}
              }
            },
            {
              name: "getInjuryNews",
              description: "Get injury and availability news for FPL players. Returns all flagged players with their status, chance of playing, and news. Optionally filter by team name.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  teamName: { type: Type.STRING, description: "Optional team name to filter by (e.g. 'Arsenal', 'Liverpool')" }
                }
              }
            },
            {
              name: "getDeepStats",
              description: "Get deep underlying stats for a specific player from Understat: xG, xA, npxG per 90, shot volume, key passes, and xG over/underperformance. Use when asked about underlying stats, xG, or whether a player is due goals.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  playerName: { type: Type.STRING, description: "Player name or surname (e.g. 'Salah', 'Haaland')" }
                },
                required: ["playerName"]
              }
            }
          ]
        }
      ];

      let squadSection = "";
      if (teamContext?.squad?.length) {
        const posOrder: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
        const sorted = [...teamContext.squad].sort((a: any, b: any) => (posOrder[a.position] ?? 5) - (posOrder[b.position] ?? 5));
        const squadLines = sorted.map((p: any) => {
          const flags = [p.is_captain && "C", p.is_vice_captain && "VC", p.status !== "a" && `⚠ ${p.news || p.status}`].filter(Boolean).join(" ");
          return `  ${p.position} ${p.name} (${p.team}, £${p.price}m, ${p.total_points}pts, form ${p.form}, FDR ${p.fdr})${flags ? " — " + flags : ""}`;
        }).join("\n");
        squadSection = `

The user's FPL team: ${teamContext.teamName}
Budget: £${teamContext.budget}m | Free transfers: ${teamContext.freeTransfers} | Overall rank: ${teamContext.overallRank?.toLocaleString() ?? "N/A"} | Total points: ${teamContext.totalPoints}
Squad:
${squadLines}

When answering questions about transfers, captaincy, or squad decisions, reference this squad directly. Do not call tools to look up players already in their squad.`;
      }

      const systemInstruction = `You are an expert Fantasy Premier League (FPL) assistant. You help users make smart transfer decisions, captain choices, and squad-building strategies.
You have access to live FPL data through tool functions. Always use the tools to get real data before answering questions about players, fixtures, or stats.
Be concise, direct, and use specific numbers. Format responses with markdown for readability.${squadSection}`;

      const contents: any[] = (chatHistory || []).map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      contents.push({ role: "user", parts: [{ text: message }] });

      let response = await generateWithFallback(ai, contents, { systemInstruction, tools });

      // Agentic loop: handle function calls
      while (response.functionCalls && response.functionCalls.length > 0) {
        const functionCall = response.functionCalls[0];
        const { name, args } = functionCall;

        let toolResult: any;
        try {
          if (name === "getPlayerStats") toolResult = await toolGetPlayerStats(args as any);
          else if (name === "getUpcomingFixtures") toolResult = await toolGetUpcomingFixtures(args as any);
          else if (name === "analyzePlayer") toolResult = await toolAnalyzePlayer(args as any);
          else if (name === "getPriceChanges") toolResult = await toolGetPriceChanges();
          else if (name === "getInjuryNews") toolResult = await toolGetInjuryNews(args as any);
          else if (name === "getDeepStats") toolResult = await toolGetDeepStats(args as any);
          else toolResult = { error: `Unknown tool: ${name}` };
        } catch (err: any) {
          toolResult = { error: err.message };
        }

        // Append the model's function call turn and the tool result
        contents.push({ role: "model", parts: [{ functionCall: { name, args } }] });
        contents.push({
          role: "user",
          parts: [{ functionResponse: { name, response: { result: toolResult } } }]
        });

        response = await generateWithFallback(ai, contents, { systemInstruction, tools });
      }

      const text = response.text ?? "Sorry, I couldn't generate a response.";
      res.json({ reply: text });
    } catch (error: any) {
      console.error("Chat error:", error);
      if (error.status === 429) {
        return res.status(429).json({ error: "We've hit our free AI limit for today — check back tomorrow!" });
      }
      res.status(500).json({ error: "Failed to get AI response. Please try again." });
    }
  });
  // --- End AI Chat Endpoints ---

  // --- Season Archive Endpoint ---
  const PRIORS_FILE = path.join(process.cwd(), "season_priors.json");

  app.post("/api/fpl/archive-season", async (req, res) => {
    try {
      console.log("Starting season archive...");

      // 1. Fetch current bootstrap and fixtures from FPL API
      const [bootstrapRes, fixturesRes] = await Promise.all([
        fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS }),
        fetch("https://fantasy.premierleague.com/api/fixtures/", { headers: FPL_HEADERS })
      ]);

      if (!bootstrapRes.ok || !fixturesRes.ok) {
        return res.status(503).json({ error: "FPL API unavailable. Try again later." });
      }

      const bootstrapData = await bootstrapRes.json();
      const fixturesData = await fixturesRes.json();
      const allPlayers = bootstrapData.elements;
      const allTeams = bootstrapData.teams;
      const allFixtures = fixturesData;

      // 2. Calculate live standings & TFDR map
      const standings = calculateLiveStandings(allFixtures);
      const rawTfdrMap: Record<number, any> = {};

      allTeams.forEach((t: any) => {
        const st = standings[t.id] || {
          position: 10,
          rank_attack_home: 10, rank_attack_away: 10, rank_attack_overall: 10,
          rank_defense_home: 10, rank_defense_away: 10, rank_defense_overall: 10
        };

        const attackFormHome = calculateAttackForm(t.id, allFixtures, 'home');
        const defenseFormHome = calculateDefenseForm(t.id, allFixtures, 'home');
        const attackFormAway = calculateAttackForm(t.id, allFixtures, 'away');
        const defenseFormAway = calculateDefenseForm(t.id, allFixtures, 'away');

        rawTfdrMap[t.id] = {
          home: {
            defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_home, attackFormHome),
            attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_home, defenseFormHome, true),
            overall: calculateRawTFDR(t.strength, st.position, attackFormHome)
          },
          away: {
            defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_away, attackFormAway),
            attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_away, defenseFormAway, true),
            overall: calculateRawTFDR(t.strength, st.position, attackFormAway)
          }
        };
      });

      normalizeTFDRMap(rawTfdrMap);

      // 3. For each player with cached history, compute performance profile
      const playerArchive: Record<number, any> = {};
      let archived = 0;

      for (const player of allPlayers) {
        const summary = playerSummariesCache[player.id];
        if (!summary || !Array.isArray(summary.history) || summary.history.length === 0) continue;

        const profile = calculatePerformanceProfile(
          summary.history, allFixtures, rawTfdrMap, player.status, 3, 270, player.element_type
        );

        playerArchive[player.id] = {
          web_name: player.web_name,
          team: player.team,
          element_type: player.element_type,
          now_cost: player.now_cost,
          total_points: player.total_points,
          points_per_game: player.points_per_game,
          base_pp90: profile.base_pp90,
          pp90_fdr2: profile.pp90_fdr2,
          pp90_fdr3: profile.pp90_fdr3,
          pp90_fdr4: profile.pp90_fdr4,
          pp90_fdr5: profile.pp90_fdr5,
          reliability_score: profile.reliability_score,
          efficiency_rating: profile.efficiency_rating,
          archetype: profile.archetype,
          appearances: profile.appearances,
          total_minutes: profile.total_minutes
        };
        archived++;
      }

      // 4. Build and save the archive
      const currentSeason = bootstrapData.events?.[0]?.deadline_time?.substring(0, 4) || new Date().getFullYear().toString();
      const archive = {
        season: `${currentSeason}-${(parseInt(currentSeason) + 1).toString().slice(-2)}`,
        archivedAt: new Date().toISOString(),
        teamStandings: standings,
        tfdrMap: rawTfdrMap,
        teams: allTeams.map((t: any) => ({
          id: t.id, name: t.name, short_name: t.short_name, strength: t.strength
        })),
        players: playerArchive
      };

      fs.writeFileSync(PRIORS_FILE, JSON.stringify(archive, null, 2));
      console.log(`Season archive complete: ${archived} players archived to ${PRIORS_FILE}`);

      res.json({
        success: true,
        season: archive.season,
        playersArchived: archived,
        teamsArchived: allTeams.length,
        archivedAt: archive.archivedAt
      });
    } catch (error: any) {
      console.error("Error archiving season:", error);
      res.status(500).json({ error: error.message || "Failed to archive season data" });
    }
  });

  // Serve season priors if they exist (for Phase 3 — prior loading)
  app.get("/api/fpl/season-priors", (req, res) => {
    try {
      if (fs.existsSync(PRIORS_FILE)) {
        const data = JSON.parse(fs.readFileSync(PRIORS_FILE, "utf-8"));
        res.json(data);
      } else {
        res.json(null);
      }
    } catch (error: any) {
      console.error("Error reading season priors:", error);
      res.status(500).json({ error: "Failed to read season priors" });
    }
  });
  // --- End Season Archive ---

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // --- Keep-Alive (Self-Ping) ---
    // Render spins down free tier apps after 15 mins of inactivity.
    // This pings the app's own endpoint every 14 mins to keep it warm.
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
      console.log(`Keep-alive active. Pinging ${RENDER_EXTERNAL_URL} every 14 minutes.`);
      setInterval(() => {
        fetch(`${RENDER_EXTERNAL_URL}/api/fpl/bootstrap`)
          .then(() => console.log(`Self-ping successful: ${new Date().toISOString()}`))
          .catch(err => console.error("Self-ping failed:", err));
      }, 1000 * 60 * 14);
    }
    // --- End Keep-Alive ---
  });
}

startServer().catch(err => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
