import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile
} from "./src/utils/metrics";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  const FPL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  };
  const CACHE_FILE = path.join(process.cwd(), "player_summaries_cache.json");
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
    } catch (err) {
      console.error("Error during background sync", err);
    } finally {
      isSyncing = false;
    }
  }

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

startServer();
