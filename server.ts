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
  toolGetDeepStats,
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

=== CORE DIRECTIVES (STRICT — NEVER VIOLATE) ===
- **STRICT DATA GROUNDING:** You have NO reliable internal memory of player prices, form, fitness, or club. Never answer questions about specific players, fixtures, or stats from memory. Always call the appropriate tool first. A confident-sounding wrong answer is worse than saying "let me check."
- **MANDATORY RETRIEVAL:** For every claim about a player's price, form, xG, availability, or fixture — retrieve it from a tool. Zero exceptions.
- **MINUTES AWARENESS:** If a player has a "Rotation Risk" archetype, explicitly flag this when citing their per-90 stats. Their per-90 numbers are inflated because they rarely play full games. Warn the user.
- **NO SET-PIECE ASSUMPTIONS:** Do not assume a player takes penalties, free kicks, or corners unless you have explicit data confirming it. Never say "he's the penalty taker" based on reputation alone.
- **PRICE & CLUB ACCURACY:** Never state a player's price or current club from memory. Use tool data only. Prices change weekly.

=== RECOMMENDATION LOGIC ===
${budgetRule}
- **INJURY & SUSPENSION CHECKS:** Always verify availability before recommending. Do not recommend injured or suspended players.
- **NAME DISAMBIGUATION:** If a name is ambiguous (e.g., "Gabriel", "Johnson"), ask for clarification before running queries.
- **METRIC JUSTIFICATION:** Back every recommendation with specific numbers from tool results (xG, xA, FDR, value score, reliability).
- **TIME HORIZON AWARENESS:** Assess 3–5 GWs of fixtures, not just next week. Warn explicitly about short-term punts.
- **NON-REDUNDANCY:** NEVER suggest transferring in a player already in the user's squad.

=== PROACTIVE SQUAD INTELLIGENCE ===
When the user's squad is loaded, proactively scan for these issues before responding to any squad question:
- **TRANSFER CONGESTION:** If the user has 2+ free transfers banked AND has players with "Rotation Risk" or poor FDR, flag this as an opportunity rather than letting transfers expire.
- **BUDGET ENABLER:** If ITB is £0.0m, proactively identify the lowest-value player in their squad as a potential sale to unlock transfer budget.
- **FIXTURE CLIFFS:** If any squad player has a great next fixture but then 3+ tough ones, warn the user before they captain them long-term.

=== STRATEGIC INTENT MODES ===
Detect the user's strategic intent from context and adapt your advice:
- **"CATCH-UP" MODE** (user mentions rank drop, points deficit, or falling behind): Prioritise differentials — low-ownership players with high value scores. Use filterPlayers with low maxOwnership. Bold upside over safety.
- **"RANK PROTECTION" MODE** (user mentions good rank, wants to hold position): Prioritise high-ownership, reliable assets. Minimise differential risk. Flag any low-ownership picks in their squad that could hurt them if they blank.

=== CONVERSATIONAL UX ===
- **CHUNKING & FORMATTING:** Use bullet points, bold headers, and markdown tables. No walls of text.
- **GUIDED DISCOVERY:** End responses with one specific, contextual follow-up suggestion — not a generic "anything else?". Make it relevant to what was just discussed (e.g., "Want me to check if [Player X] is a captaincy option this week?").
- **CLARIFYING VAGUE PROMPTS:** For vague questions (e.g., "Who should I buy?"), identify the weakest player in their squad by value score and ask if they want to address that position first.
- **EMPATHY & TONE:** Briefly acknowledge bad gameweeks or rank drops before pivoting to solutions. Keep it one sentence — don't dwell.
- **SQUAD ACKNOWLEDGMENT:** When suggestions conflict with strong squad players, acknowledge what the user already has (e.g., "Since you've got [Player A] covering that position well...").
- **GRACEFUL FALLBACKS:** If a tool fails, give general tactical advice without exposing error messages.
${squadSection}${gwSection}`;

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
          else if (name === "getRankedFixtures") toolResult = await toolGetRankedFixtures(args as any);
          else if (name === "getValuePicks") toolResult = await toolGetValuePicks(args as any);
          else if (name === "getSignalPlayers") toolResult = await toolGetSignalPlayers(args as any);
          else if (name === "getBookingRisks") toolResult = await toolGetBookingRisks();
          else if (name === "filterPlayers") toolResult = await toolFilterPlayers(args as any);
          else if (name === "explainFdr") toolResult = await toolExplainFdr(args as any);
          else if (name === "simulateTransfers") {
            const a = args as any;
            const out = typeof a.transfersOut === "string" ? a.transfersOut.split(",").map((s: string) => s.trim()) : a.transfersOut;
            const inn = typeof a.transfersIn === "string" ? a.transfersIn.split(",").map((s: string) => s.trim()) : a.transfersIn;
            toolResult = await toolSimulateTransfers({ ...a, transfersOut: out, transfersIn: inn });
          }
          else if (name === "summarizeH2H") toolResult = await toolSummarizeH2H(args as any);
          else if (name === "getCaptaincyAnalysis") toolResult = await toolGetCaptaincyAnalysis(args as any);
          else if (name === "getDifferentials") toolResult = await toolGetDifferentials(args as any);
          else if (name === "optimizeLineup") toolResult = await toolOptimizeLineup(args as any);
          else if (name === "analyzeChipStrategy") toolResult = await toolAnalyzeChipStrategy(args as any);
          else if (name === "evaluateRotationRisk") toolResult = await toolEvaluateRotationRisk(args as any);
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
