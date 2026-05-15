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
import { getCachedBootstrap, buildChatConfig } from "./src/server/chatPrompt";

const ENABLE_AI_CHAT = process.env.ENABLE_AI_CHAT === "true";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const PRIORS_FILE = path.join(process.cwd(), "season_priors.json");
const TWELVE_HOURS = 1000 * 60 * 60 * 12;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const fs = await import("fs");

  const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://localhost:3000";
  app.use(cors({ origin: ALLOWED_ORIGIN }));
  app.use(express.json({ limit: "20kb" }));

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
  const ADMIN_SECRET = process.env.ADMIN_SECRET || "";
  app.post("/api/admin/force-sync", async (req, res) => {
    if (!ADMIN_SECRET || req.headers["x-admin-secret"] !== ADMIN_SECRET)
      return res.status(403).json({ error: "Forbidden." });
    if (isSyncing) return res.json({ status: "already_syncing" });
    syncAllPlayers();
    res.json({ status: "sync_started" });
  });

  // --- FPL API Proxy ---
  app.get("/api/fpl/bootstrap", async (_req, res) => {
    try {
      const data = await getCachedBootstrap();
      if (!data) return res.status(500).json({ error: "Failed to fetch FPL bootstrap data" });
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

    const { message, teamId, teamContext, history: chatHistory, currentGW } = req.body;
    if (!message || typeof message !== "string")
      return res.status(400).json({ error: "Message is required." });
    if (message.length > 2000)
      return res.status(400).json({ error: "Message is too long (max 2000 characters)." });

    incrementChatCount();

    try {
      const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
      
      const { systemInstruction, tools, isPlayerQuery } = await buildChatConfig({
        teamId,
        teamContext,
        currentGW,
        message
      });

      // Sanitize history: only accept valid role/content pairs, cap at 20 turns to prevent injection
      const safeHistory = Array.isArray(chatHistory)
        ? chatHistory
            .filter((m: any) => ["user", "model"].includes(m.role) && typeof m.content === "string")
            .slice(-20)
        : [];
      const contents: any[] = safeHistory.map((m: any) => ({
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

  // Season priors are generated by: npm run archive-season
  // See scripts/archive-season.ts — runs standalone, no server needed.
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
