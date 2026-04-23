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
  toolGetRankedFixtures,
  toolGetValuePicks,
  toolGetSignalPlayers,
  toolGetBookingRisks,
  toolFilterPlayers,
  toolExplainFdr,
  toolSimulateTransfers,
  toolSummarizeH2H,
  toolGetCaptaincyAnalysis,
  toolGetDifferentials,
  toolOptimizeLineup,
  toolAnalyzeChipStrategy,
  toolEvaluateRotationRisk
} from "./src/server/chatTools";

const ENABLE_AI_CHAT = process.env.ENABLE_AI_CHAT === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIORS_FILE = path.join(process.cwd(), "season_priors.json");
const TWELVE_HOURS = 1000 * 60 * 60 * 12;

// Shared bootstrap cache for disambiguation — reused across chat requests
// 5-minute TTL keeps it fresh without hitting the FPL API on every message
let disambigBootstrapCache: { data: any; fetchedAt: number } | null = null;
const DISAMBIG_CACHE_TTL = 1000 * 60 * 5;

async function getCachedBootstrap(): Promise<any | null> {
  const now = Date.now();
  if (disambigBootstrapCache && (now - disambigBootstrapCache.fetchedAt) < DISAMBIG_CACHE_TTL) {
    return disambigBootstrapCache.data;
  }
  try {
    const res = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    if (!res.ok) return null;
    const data = await res.json();
    disambigBootstrapCache = { data, fetchedAt: now };
    return data;
  } catch {
    return null;
  }
}

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

  const GEMINI_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];


  // --- AI Chat ---
  app.post("/api/fpl/optimize", async (req, res) => {
    try {
      const { entryId, currentGW } = req.body;
      const result = await toolOptimizeLineup({ entryId, currentGW });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

    const { message, teamContext, history: chatHistory, currentGW } = req.body;
    if (!message) return res.status(400).json({ error: "Message is required." });

    incrementChatCount();

    // Pre-fetch live data for any player names mentioned in the message.
    // This injects current team/form/price into the system instruction BEFORE
    // Gemini responds, making it impossible for the model to use stale training data
    // about club affiliations or stats.
    // If a name is ambiguous (matches multiple players), an ambiguity warning is injected
    // instead of silently picking one — forcing the model to ask the user to clarify.
    const FPL_ACRONYMS = new Set(["GW", "FDR", "ITB", "FT", "WC", "TC", "BB", "FH", "MID", "FWD", "DEF", "GKP", "FPL", "PL", "EPL"]);
    const properNounPattern = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*)\b/g;
    const mentionedNames = [...message.matchAll(properNounPattern)]
      .map((m: RegExpMatchArray) => m[0])
      .filter((n: string) => !FPL_ACRONYMS.has(n))
      .slice(0, 3);

    let livePlayerSection = "";
    if (mentionedNames.length > 0) {
      // Use cached bootstrap for ambiguity classification — avoids a fresh API
      // call on every message; cache TTL is 5 minutes
      const bootstrapForDisambig = await getCachedBootstrap();
      const allPlayers: any[] = bootstrapForDisambig?.elements ?? [];
      const allTeams: any[] = bootstrapForDisambig?.teams ?? [];
      const teamNameMap: Record<number, string> = {};
      for (const t of allTeams) teamNameMap[t.id] = t.short_name;
      const posLabel = ["", "GKP", "DEF", "MID", "FWD"];

      // Phase 1: classify each name as ambiguous or unambiguous using cached data only
      const unambiguousNames: string[] = [];
      const ambiguitySections: string[] = [];

      for (const name of mentionedNames) {
        const q = name.toLowerCase();
        const matches = allPlayers.filter((p: any) =>
          p.web_name.toLowerCase() === q ||
          `${p.first_name} ${p.second_name}`.toLowerCase().includes(q) ||
          p.web_name.toLowerCase().includes(q)
        );
        if (matches.length === 0) continue;
        if (matches.length >= 2) {
          const candidates = matches.slice(0, 6).map((p: any) =>
            `  - ${p.first_name} ${p.second_name} (${teamNameMap[p.team] ?? p.team}, ${posLabel[p.element_type]}, £${(p.now_cost / 10).toFixed(1)}m)`
          ).join("\n");
          ambiguitySections.push(
            `The name "${name}" matches multiple players:\n${candidates}\nYou MUST ask the user to clarify which player they mean before calling any tool or providing any data. Do not guess or pick one yourself.`
          );
        } else {
          unambiguousNames.push(name);
        }
      }

      // Phase 2: fetch all unambiguous players in parallel
      const prefetches = await Promise.allSettled(
        unambiguousNames.map(name => toolAnalyzePlayer({ playerName: name }))
      );
      const liveSections = prefetches
        .filter(r => r.status === "fulfilled" && !(r.value as any).error)
        .map(r => {
          const p = (r as PromiseFulfilledResult<any>).value;
          return `• ${p.name} (${p.full_name}): Team=${p.team}, Price=£${p.price}m, Form=${p.form}, TotalPts=${p.total_points}, Status=${p.status ?? "Available"}`;
        });

      if (ambiguitySections.length > 0) {
        livePlayerSection += `\n\n=== PLAYER NAME AMBIGUITY DETECTED — ACTION REQUIRED ===\n` +
          ambiguitySections.join("\n\n");
      }
      if (liveSections.length > 0) {
        livePlayerSection += `\n\n=== LIVE PLAYER DATA (fetched NOW from FPL API — overrides all training knowledge) ===\nThe following data is current as of this moment. Treat it as ground truth:\n` +
          liveSections.join("\n");
      }
    }

    // Detect player-related intent to decide whether to force tool use
    const PLAYER_INTENT_PATTERN = /\b(transfer|captain|buy|sell|form|price|value|fdr|fixture|recommend|differential|who should|upgrade|downgrade|replace|pick|squad|bench|chip|wildcard|free hit|triple captain|bench boost)\b/i;
    const isPlayerQuery = PLAYER_INTENT_PATTERN.test(message) || mentionedNames.length > 0;

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
              name: "getRankedFixtures",
              description: "Rank all 20 Premier League teams by upcoming fixture difficulty. Use when asked which teams have the easiest or hardest run of fixtures. Supports position context: 'attack' for forwards/midfielders, 'defense' for defenders/keepers.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  games: { type: Type.NUMBER, description: "Number of upcoming gameweeks to assess (default 3)" },
                  position: { type: Type.STRING, description: "Optional position context: 'attack', 'defense', or omit for overall" }
                }
              }
            },
            {
              name: "getValuePicks",
              description: "Get top value players ranked by our proprietary value score (expected points × reliability), not just FPL form. Use when asked for best value picks, transfer targets, or players by archetype. More sophisticated than getPlayerStats.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.STRING, description: "Position filter: GKP, DEF, MID, or FWD" },
                  maxCost: { type: Type.NUMBER, description: "Maximum price in millions (e.g. 7.5)" },
                  minReliability: { type: Type.NUMBER, description: "Minimum reliability score 0-1 (e.g. 0.6 for reliable starters)" },
                  archetype: { type: Type.STRING, description: "Filter by player archetype: 'Talisman', 'Flat Track Bully', 'Workhorse', or 'Rotation Risk'" }
                }
              }
            },
            {
              name: "getSignalPlayers",
              description: "Find players matching a specific tactical signal flag. Use for questions like 'who are the hidden gems?', 'who's on a form run?', 'who's due a goal?', or 'who's a regression risk?'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  signal: { type: Type.STRING, description: "Signal to query: 'hiddenGem', 'formRun', 'ftbRun' (Flat Track Bully with easy fixtures), 'priceRise', 'dueAGoal', 'regressionRisk', or 'bookingRisk'" },
                  position: { type: Type.STRING, description: "Optional position filter: GKP, DEF, MID, or FWD" },
                  maxCost: { type: Type.NUMBER, description: "Optional max price in millions" }
                },
                required: ["signal"]
              }
            },
            {
              name: "getBookingRisks",
              description: "Get players at risk of a yellow card suspension ban. Use when asked about booking risks, yellow card bans, or who to avoid before a deadline. Groups players into those at imminent threshold vs. high booking rate.",
              parameters: {
                type: Type.OBJECT,
                properties: {}
              }
            },
            {
              name: "filterPlayers",
              description: "Filter players by multiple combined criteria: position, max cost, min xG per 90, max upcoming FDR, team, min reliability, or archetype. Use when the user asks for players matching several conditions at once.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.STRING, description: "GKP, DEF, MID, or FWD" },
                  maxCost: { type: Type.NUMBER, description: "Max price in £ millions" },
                  minXgPer90: { type: Type.NUMBER, description: "Minimum xG per 90 minutes" },
                  maxUpcomingFdr: { type: Type.NUMBER, description: "Maximum average upcoming fixture difficulty (1-5)" },
                  teamId: { type: Type.NUMBER, description: "FPL team ID to restrict to one club" },
                  minReliability: { type: Type.NUMBER, description: "Minimum reliability score (0-1)" },
                  archetype: { type: Type.STRING, description: "Player archetype: Talisman, Flat Track Bully, Workhorse, Rotation Risk" },
                  maxOwnership: { type: Type.NUMBER, description: "Maximum ownership % (e.g. 5 for differentials under 5%)" }
                }
              }
            },
            {
              name: "explainFdr",
              description: "Explain why a team has a given fixture difficulty rating for a specific gameweek. Breaks down TFDR inputs: opponent form, league position, home/away context. Use when asked 'why is X's FDR rated Y?' or 'what makes this fixture easy/hard?'",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  teamName: { type: Type.STRING, description: "Team name or short name (e.g. 'Liverpool' or 'LIV')" },
                  gameweek: { type: Type.NUMBER, description: "Gameweek number (defaults to current GW)" }
                },
                required: ["teamName"]
              }
            },
            {
              name: "simulateTransfers",
              description: "Validate and evaluate proposed transfers. Checks position match, 3-per-club rule, and budget. Compares valueScore (expected pts over 5 GWs) for players in and out. Use when asked 'should I transfer X for Y?' or 'is this transfer worth it?'",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  entryId: { type: Type.NUMBER, description: "FPL team ID of the user" },
                  transfersOut: { type: Type.STRING, description: "Comma-separated player names to transfer out" },
                  transfersIn: { type: Type.STRING, description: "Comma-separated player names to transfer in" },
                  currentGW: { type: Type.NUMBER, description: "Current gameweek (optional, auto-detected)" },
                  gwHorizon: { type: Type.NUMBER, description: "Number of GWs to project over for hit recovery (default 5, range 1-6)" }
                },
                required: ["entryId", "transfersOut", "transfersIn"]
              }
            },
            {
              name: "summarizeH2H",
              description: "Compare two FPL teams for a head-to-head gameweek matchup. Shows differential players, shared players, captaincy comparison, and overall value edge. Use when asked about H2H matchups or comparing squads.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  myEntryId: { type: Type.NUMBER, description: "User's FPL team ID" },
                  opponentEntryId: { type: Type.NUMBER, description: "Opponent's FPL team ID" },
                  currentGW: { type: Type.NUMBER, description: "Gameweek number (optional, auto-detected)" }
                },
                required: ["myEntryId", "opponentEntryId"]
              }
            },
            {
              name: "getCaptaincyAnalysis",
              description: "Rank captaincy options by base PP90 ÷ opponent attack difficulty × reliability. Use when asked 'who should I captain?', 'best captain this week?', or 'captaincy pick'. Works from the user's squad if entryId is known, or from explicit player names.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  squadPlayerNames: { type: Type.STRING, description: "Comma-separated player names to compare as captaincy options (if no entryId)" },
                  entryId: { type: Type.NUMBER, description: "FPL team ID to auto-load squad captaincy candidates" },
                  currentGW: { type: Type.NUMBER, description: "Gameweek number (optional, auto-detected)" }
                }
              }
            },
            {
              name: "getDifferentials",
              description: "Find low-ownership 'differential' players with high value scores. Use when the user wants to catch up in rank or find hidden gems with low selection %.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  position: { type: Type.STRING, description: "Position filter: GKP, DEF, MID, or FWD" },
                  maxCost: { type: Type.NUMBER, description: "Maximum price in millions (e.g. 7.5)" },
                  maxOwnership: { type: Type.NUMBER, description: "Maximum ownership % threshold (default 10)" },
                  limit: { type: Type.NUMBER, description: "Number of players to return (default 10)" }
                }
              }
            },
            {
              name: "optimizeLineup",
              description: "Evaluate the user's 15-man squad and recommend the mathematically optimal starting XI, Captain, and Vice-Captain for the immediate next gameweek. Recommended when the user asks 'who should I start?', 'set my team', or 'optimize my lineup'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  entryId: { type: Type.NUMBER, description: "FPL team ID of the user" },
                  currentGW: { type: Type.NUMBER, description: "Gameweek number (optional, auto-detected)" }
                },
                required: ["entryId"]
              }
            },
            {
              name: "analyzeChipStrategy",
              description: "Assess upcoming Blank and Double Gameweeks against the user's squad and remaining chips. Use for questions like 'when should I use my Wildcard?', 'is a Free Hit worth it?', or 'any upcoming double gameweeks?'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  entryId: { type: Type.NUMBER, description: "FPL team ID of the user" },
                  currentGW: { type: Type.NUMBER, description: "Gameweek number (optional, auto-detected)" }
                },
                required: ["entryId"]
              }
            },
            {
              name: "evaluateRotationRisk",
              description: "Assess the likelihood of a player being benched for tactical reasons or fatigue (e.g. Pep Roulette). Use for questions like 'is Foden a rotation risk?', 'should I start Trossard or is he tired?', or 'who is the most nailed City player?'.",
              parameters: {
                type: Type.OBJECT,
                properties: {
                  playerNames: { 
                    type: Type.ARRAY, 
                    items: { type: Type.STRING },
                    description: "List of player names to evaluate" 
                  }
                },
                required: ["playerNames"]
              }
            }
          ]
        }
      ];

      let squadSection = "";
      let budgetRule = "";
      
      if (teamContext?.squad?.length) {
        const posOrder: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
        const sorted = [...teamContext.squad].sort((a: any, b: any) => (posOrder[a.position] ?? 5) - (posOrder[b.position] ?? 5));
        const squadLines = sorted.map((p: any) => {
          const flags = [p.is_captain && "C", p.is_vice_captain && "VC", p.status !== "a" && `⚠ ${p.news || p.status}`].filter(Boolean).join(" ");
          return `  ${p.position} ${p.name} (${p.team}, £${p.price}m, ${p.total_points}pts, form ${p.form}, FDR ${p.fdr})${flags ? " — " + flags : ""}`;
        }).join("\n");
        squadSection = `
=== USER'S SQUAD CONTEXT ===
Team Name: ${teamContext.teamName}
Budget (In The Bank): £${teamContext.budget}m | Free Transfers: ${teamContext.freeTransfers} | Overall Rank: ${teamContext.overallRank?.toLocaleString() ?? "N/A"} | Total Points: ${teamContext.totalPoints}

Current Squad:
${squadLines}

When answering questions about transfers, captaincy, or squad decisions, reference this squad directly. Do not call tools to look up players already in their squad.`;

        budgetRule = `- **BUDGET STRICTNESS:** The user has £${teamContext.budget}m In The Bank (ITB). Do not recommend unaffordable transfers without explicitly suggesting downgrades elsewhere to fund it. Check the price of the player being sold and the player being bought to ensure the math works.`;
      } else {
        budgetRule = `- **BUDGET STRICTNESS:** If the user has not provided their budget, explicitly ask them for their 'In The Bank' (ITB) amount before making concrete transfer combinations.`;
      }

      const gwSection = currentGW ? `\n\n=== CURRENT GAMEWEEK ===\nCurrent gameweek: GW${currentGW}. The next gameweek is GW${currentGW + 1}. Use these numbers when referring to 'this GW', 'next GW', or similar.` : "";

      const systemInstruction = `You are an expert Fantasy Premier League (FPL) strategic consultant. You help users make smart transfer decisions, captain choices, and squad-building strategies — grounded exclusively in live data.

=== 1. HARD CONSTRAINTS (NEVER VIOLATE) ===
1. **NO STALE TRAINING DATA.** Your knowledge of player clubs, prices, form, and fixtures is at least one full season out of date. Never state a fact about a specific player without having retrieved it via a tool in this conversation.
   - ❌ "Isak plays for Newcastle at £8.5m" — fabricated from training
   - ✅ "According to live data, Isak plays for [TEAM] at £[PRICE]m"
2. **TOOL RESULT IS GROUND TRUTH.** If a tool result contradicts your expectation, use the tool result. Never defend a prior belief against live data.
3. **NO ASSUMPTION ON SET PIECES OR TEAM.** Never state a player is a penalty/free-kick taker, or name their club, unless a tool result confirms it.
4. **NO UNAVAILABILITY EXCUSES FOR xG/xA.** analyzePlayer always returns xG_per_90, xA_per_90, and xGI_per_90 from FPL match history. Never tell a user this data is unavailable.
5. **ROTATION RISK CAVEAT.** If a player's archetype is "Rotation Risk", flag that their per-90 stats are inflated by limited minutes whenever you cite them.

=== 2. TOOL USE POLICY ===
- **MANDATORY LOOKUP:** Any claim about price, form, xG, fixtures, availability, yellow/red cards, or archetype requires a tool call in this conversation first.
- **DISAMBIGUATION:** If this instruction contains a "PLAYER NAME AMBIGUITY DETECTED" block, you MUST ask the user to clarify which player they mean before calling any tool or stating any stat. Never silently pick the most likely candidate.
- **RIGHT TOOL FOR THE JOB:**
  - Player stats, xG/xA, cards, start rate, archetype → analyzePlayer
  - Fixtures and FDR → getUpcomingFixtures or getRankedFixtures
  - Injury/availability → getInjuryNews
  - Price changes → getPriceChanges
  - Booking/card risks → analyzePlayer (individual); getBookingRisks (league-wide scan)
  - Comparing multiple players → filterPlayers or multiple analyzePlayer calls
  - Squad decisions → simulateTransfers
- **SQUAD PLAYERS:** Do not call tools to look up players already listed in the USER'S SQUAD CONTEXT below — their data is already present.

=== 3. SQUAD & TRANSFER LOGIC ===
${budgetRule}
- **AVAILABILITY FIRST:** Always verify injury/suspension status before recommending any player.
- **NON-REDUNDANCY:** Never recommend transferring in a player already in the user's squad.
- **FIXTURE HORIZON:** Assess 3–5 GWs of fixtures, not just the next one. Explicitly warn about short-term punts.
- **METRIC JUSTIFICATION:** Back every recommendation with specific numbers from tool results (e.g. xG, FDR, reliability, value score).

=== 4. METRIC REFERENCE ===
Archetypes — Talisman: consistent starter with returns | Flat Track Bully: scores vs easy opponents, blanks vs tough | Workhorse: reliable minutes, low ceiling | Rotation Risk: strong per-90 but frequently benched.
PP90: points per 90 minutes (efficiency across different playing time).
xG_per_90 / xA_per_90 / xGI_per_90: expected goals/assists/goal involvement per 90, from FPL match history.
Reliability: fraction of expected minutes played (>0.8 = nailed; <0.6 = rotation risk).
Start rate: fraction of appearances as a starter — prefer this over reliability when explaining to users.
Efficiency rating: total points per £m spent.
ep_next: FPL's expected points for next GW — use as a captaincy sanity check.
xGC_per_90: expected goals conceded per 90 — key for DEF/GKP clean sheet potential.
yellow_cards / red_cards: returned by analyzePlayer. PL ban thresholds: 5 yellows before GW19, 10 before GW32, 15 anytime.
When explaining a metric, call analyzePlayer first, then give one sentence defining it and one sentence interpreting that player's actual number.

=== 5. RESPONSE FORMAT ===
- Use bullet points and bold headers. No walls of text.
- Player comparisons: always use a markdown table (players as columns, metrics as rows).
- End every response with one specific, contextual follow-up question — never a generic "anything else?".
- For vague questions ("Who should I buy?"), ask one clarifying question to narrow scope before fetching data.
- If a tool fails, give general tactical advice — never expose raw error messages to the user.
${squadSection}${gwSection}${livePlayerSection}`;

      const contents: any[] = (chatHistory || []).map((m: any) => ({
        role: m.role,
        parts: [{ text: m.content }]
      }));
      contents.push({ role: "user", parts: [{ text: message }] });

      // Dispatch a single tool call by name
      async function dispatchTool(name: string, args: any): Promise<any> {
        if (name === "getPlayerStats") return toolGetPlayerStats(args);
        if (name === "getUpcomingFixtures") return toolGetUpcomingFixtures(args);
        if (name === "analyzePlayer") return toolAnalyzePlayer(args);
        if (name === "getPriceChanges") return toolGetPriceChanges();
        if (name === "getInjuryNews") return toolGetInjuryNews(args);
        if (name === "getRankedFixtures") return toolGetRankedFixtures(args);
        if (name === "getValuePicks") return toolGetValuePicks(args);
        if (name === "getSignalPlayers") return toolGetSignalPlayers(args);
        if (name === "getBookingRisks") return toolGetBookingRisks();
        if (name === "filterPlayers") return toolFilterPlayers(args);
        if (name === "explainFdr") return toolExplainFdr(args);
        if (name === "simulateTransfers") {
          const out = typeof args.transfersOut === "string" ? args.transfersOut.split(",").map((s: string) => s.trim()) : args.transfersOut;
          const inn = typeof args.transfersIn === "string" ? args.transfersIn.split(",").map((s: string) => s.trim()) : args.transfersIn;
          return toolSimulateTransfers({ ...args, transfersOut: out, transfersIn: inn });
        }
        if (name === "summarizeH2H") return toolSummarizeH2H(args);
        if (name === "getCaptaincyAnalysis") return toolGetCaptaincyAnalysis(args);
        if (name === "getDifferentials") return toolGetDifferentials(args);
        if (name === "optimizeLineup") return toolOptimizeLineup(args);
        if (name === "analyzeChipStrategy") return toolAnalyzeChipStrategy(args);
        if (name === "evaluateRotationRisk") return toolEvaluateRotationRisk(args);
        return { error: `Unknown tool: ${name}` };
      }

      // Set SSE headers before generation starts so we can stream chunks
      // as soon as Gemini begins producing text.
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("X-Accel-Buffering", "no");

      let streamingStarted = false;
      let isFirstCall = true;
      let continueLoop = true;

      try {
        while (continueLoop) {
          const callConfig: any = {
            systemInstruction,
            tools,
            ...(isFirstCall && { toolConfig: { functionCallingConfig: { mode: isPlayerQuery ? "ANY" : "AUTO" } } })
          };

          // Try each model in the fallback chain
          let modelSucceeded = false;
          for (const model of GEMINI_MODEL_CHAIN) {
            try {
              const stream = await ai.models.generateContentStream({ model, contents, config: callConfig });
              const roundCalls: any[] = [];

              for await (const chunk of stream) {
                if ((chunk as any).functionCalls?.length) roundCalls.push(...(chunk as any).functionCalls);
                if (chunk.text) {
                  streamingStarted = true;
                  res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
                }
              }

              if (roundCalls.length > 0) {
                // Execute all tool calls from this round in parallel
                const settled = await Promise.allSettled(
                  roundCalls.map(({ name, args }: any) => dispatchTool(name, args))
                );
                const results = settled.map((r) =>
                  r.status === "fulfilled" ? r.value : { error: (r as PromiseRejectedResult).reason?.message ?? "Tool error" }
                );
                contents.push({ role: "model", parts: roundCalls.map(({ name, args }: any) => ({ functionCall: { name, args } })) });
                contents.push({ role: "user", parts: roundCalls.map(({ name }: any, i: number) => ({ functionResponse: { name, response: { result: results[i] } } })) });
              } else {
                continueLoop = false;
              }

              modelSucceeded = true;
              break;
            } catch (err: any) {
              const status = err.status ?? err.statusCode;
              if (status === 503 || status === 500 || status === 429) continue;
              throw err;
            }
          }

          if (!modelSucceeded) throw new Error("All models exhausted");
          isFirstCall = false;
        }

        res.write("data: [DONE]\n\n");
        res.end();
      } catch (error: any) {
        console.error("Chat error:", error);
        if (streamingStarted) {
          res.write(`data: ${JSON.stringify({ error: "An error occurred mid-response." })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        } else if (error.status === 429) {
          res.status(429).json({ error: "We've hit our free AI limit for today — check back tomorrow!" });
        } else {
          res.status(500).json({ error: "Failed to get AI response. Please try again." });
        }
      }
    } catch (error: any) {
      console.error("Chat setup error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to get AI response. Please try again." });
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
