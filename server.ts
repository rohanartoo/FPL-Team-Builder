import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile
} from "./src/utils/metrics";
import {
  playerSummariesCache,
  lastSyncCompleted,
  isSyncing,
  syncProgress,
  injuryPeriodsCache,
  FPL_HEADERS,
  loadCacheFromDisk,
  loadInjuryPeriodsFromDisk,
  syncAllPlayers
} from "./src/server/cache";
import {
  CHAT_SOFT_LIMIT,
  chatRequestCount,
  resetCounterIfNewDay,
  incrementChatCount,
  validateToken,
  registerAuthRoutes
} from "./src/server/auth";
import {
  toolGetPlayerStats,
  toolGetUpcomingFixtures,
  toolAnalyzePlayer,
  toolGetPriceChanges,
  toolGetInjuryNews,
  toolGetDeepStats
} from "./src/server/chatTools";

const ENABLE_AI_CHAT = process.env.ENABLE_AI_CHAT === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIORS_FILE = path.join(process.cwd(), "season_priors.json");
const TWELVE_HOURS = 1000 * 60 * 60 * 12;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const fs = await import("fs");

  app.use(cors());
  app.use(express.json());

  await loadCacheFromDisk();
  await loadInjuryPeriodsFromDisk();

  const isStale = !lastSyncCompleted || (Date.now() - new Date(lastSyncCompleted).getTime() > TWELVE_HOURS);
  const isEmpty = Object.keys(playerSummariesCache).length === 0;
  if (isStale || isEmpty) {
    console.log(isEmpty ? "Cache is empty. Starting initial sync..." : "Cache is stale. Starting background sync...");
    syncAllPlayers();
  } else {
    console.log(`Cache is fresh (last sync: ${lastSyncCompleted}). Skip background sync.`);
  }
  setInterval(syncAllPlayers, TWELVE_HOURS);

  // --- Admin ---
  app.post("/api/admin/force-sync", async (_req, res) => {
    if (isSyncing) return res.json({ status: "already_syncing" });
    syncAllPlayers();
    res.json({ status: "sync_started" });
  });

  // --- FPL API Proxy ---
  app.get("/api/fpl/bootstrap", async (_req, res) => {
    try {
      const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
      const data = await response.json();
      res.setHeader("Cache-Control", "no-store");
      res.json(data);
    } catch (error) {
      console.error("Error fetching FPL bootstrap:", error);
      res.status(500).json({ error: "Failed to fetch FPL bootstrap data" });
    }
  });

  app.get("/api/fpl/fixtures", async (_req, res) => {
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

  app.get("/api/fpl/all-summaries", (_req, res) => {
    res.json({ isSyncing, progress: syncProgress, summaries: playerSummariesCache, lastSyncCompleted });
  });

  app.get("/api/fpl/injury-periods", (_req, res) => {
    res.json(injuryPeriodsCache);
  });

  app.get("/api/fpl/entry/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const response = await fetch(`https://fantasy.premierleague.com/api/entry/${id}/`, { headers: FPL_HEADERS });
      if (!response.ok) return res.status(response.status).json({ error: "Could not find team. Check your ID." });
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
      if (!response.ok) return res.status(response.status).json({ error: "Could not find history for this entry." });
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
      if (!response.ok) return res.status(response.status).json({ error: "Could not find picks for this event." });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      console.error(`Error fetching FPL picks for ${id} event ${event}:`, error);
      res.status(500).json({ error: `Failed to fetch FPL picks for ${id} event ${event}` });
    }
  });

  // --- Auth ---
  registerAuthRoutes(app);

  // --- Gemini Retry + Model Fallback ---
  const GEMINI_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  const MAX_RETRIES_PER_MODEL = 2;
  const BASE_BACKOFF_MS = 1000;

  async function generateWithFallback(ai: GoogleGenAI, contents: any[], config: any): Promise<any> {
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
            if (attempt < MAX_RETRIES_PER_MODEL) {
              const delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
              console.warn(`[AI] Transient ${status} on model=${model} attempt=${attempt}. Retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
            } else {
              console.warn(`[AI] Exhausted retries for model=${model}. Cascading to next model...`);
            }
          } else if (status === 429) {
            console.warn(`[AI] Quota exhausted (429) for model=${model}. Cascading to next model immediately...`);
            break;
          } else {
            throw err;
          }
        }
      }
    }
    throw lastError;
  }

  // --- AI Chat ---
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

    incrementChatCount();

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
              parameters: { type: Type.OBJECT, properties: {} }
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

        contents.push({ role: "model", parts: [{ functionCall: { name, args } }] });
        contents.push({ role: "user", parts: [{ functionResponse: { name, response: { result: toolResult } } }] });

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

  // --- Season Archive ---
  app.post("/api/fpl/archive-season", async (_req, res) => {
    try {
      console.log("Starting season archive...");
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

      const playerArchive: Record<number, any> = {};
      let archived = 0;

      for (const player of allPlayers) {
        const summary = playerSummariesCache[player.id];
        if (!summary || !Array.isArray(summary.history) || summary.history.length === 0) continue;
        const profile = calculatePerformanceProfile(
          summary.history, allFixtures, rawTfdrMap, player.status, 3, 270, player.element_type
        );
        playerArchive[player.id] = {
          web_name: player.web_name, team: player.team, element_type: player.element_type,
          now_cost: player.now_cost, total_points: player.total_points, points_per_game: player.points_per_game,
          base_pp90: profile.base_pp90, pp90_fdr2: profile.pp90_fdr2, pp90_fdr3: profile.pp90_fdr3,
          pp90_fdr4: profile.pp90_fdr4, pp90_fdr5: profile.pp90_fdr5,
          reliability_score: profile.reliability_score, efficiency_rating: profile.efficiency_rating,
          archetype: profile.archetype, appearances: profile.appearances, total_minutes: profile.total_minutes
        };
        archived++;
      }

      const currentSeason = bootstrapData.events?.[0]?.deadline_time?.substring(0, 4) || new Date().getFullYear().toString();
      const archive = {
        season: `${currentSeason}-${(parseInt(currentSeason) + 1).toString().slice(-2)}`,
        archivedAt: new Date().toISOString(),
        teamStandings: standings,
        tfdrMap: rawTfdrMap,
        teams: allTeams.map((t: any) => ({ id: t.id, name: t.name, short_name: t.short_name, strength: t.strength })),
        players: playerArchive
      };

      fs.writeFileSync(PRIORS_FILE, JSON.stringify(archive, null, 2));
      console.log(`Season archive complete: ${archived} players archived to ${PRIORS_FILE}`);
      res.json({ success: true, season: archive.season, playersArchived: archived, teamsArchived: allTeams.length, archivedAt: archive.archivedAt });
    } catch (error: any) {
      console.error("Error archiving season:", error);
      res.status(500).json({ error: error.message || "Failed to archive season data" });
    }
  });

  app.get("/api/fpl/season-priors", (_req, res) => {
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

  // --- Static / Vite ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
      console.log(`Keep-alive active. Pinging ${RENDER_EXTERNAL_URL} every 14 minutes.`);
      setInterval(() => {
        fetch(`${RENDER_EXTERNAL_URL}/api/fpl/bootstrap`)
          .then(() => console.log(`Self-ping successful: ${new Date().toISOString()}`))
          .catch(err => console.error("Self-ping failed:", err));
      }, 1000 * 60 * 14);
    }
  });
}

startServer().catch(err => {
  console.error("Fatal server error:", err);
  process.exit(1);
});
