import { Type } from "@google/genai";
import { toolAnalyzePlayer } from "./chatTools";

let disambigBootstrapCache: { data: any; fetchedAt: number } | null = null;
const DISAMBIG_CACHE_TTL = 1000 * 60 * 5;

export async function getCachedBootstrap(): Promise<any | null> {
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

export const tools = [
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

export async function buildChatConfig({
  teamId,
  teamContext,
  currentGW,
  message
}: {
  teamId?: string | null;
  teamContext?: any;
  currentGW?: number | null;
  message: string;
}) {
  const FPL_ACRONYMS = new Set(["GW", "FDR", "ITB", "FT", "WC", "TC", "BB", "FH", "MID", "FWD", "DEF", "GKP", "FPL", "PL", "EPL"]);
  const properNounPattern = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})*)\b/g;
  const mentionedNames = [...message.matchAll(properNounPattern)]
    .map((m: RegExpMatchArray) => m[0])
    .filter((n: string) => !FPL_ACRONYMS.has(n))
    .slice(0, 3);

  let livePlayerSection = "";
  if (mentionedNames.length > 0) {
    const bootstrapForDisambig = await getCachedBootstrap();
    const allPlayers: any[] = bootstrapForDisambig?.elements ?? [];
    const allTeams: any[] = bootstrapForDisambig?.teams ?? [];
    const teamNameMap: Record<number, string> = {};
    for (const t of allTeams) teamNameMap[t.id] = t.short_name;
    const posLabel = ["", "GKP", "DEF", "MID", "FWD"];

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

    const prefetches = await Promise.allSettled(
      unambiguousNames.map(name => toolAnalyzePlayer({ playerName: name }))
    );
    const liveSections = prefetches
      .filter(r => r.status === "fulfilled" && !(r.value as any).error)
      .map(r => {
        const p = (r as PromiseFulfilledResult<any>).value;
        return `• ${p.name} (${p.full_name}): Team=${p.team}, Position=${p.position}, Price=£${p.price}m, Form=${p.form}, TotalPts=${p.total_points}, Status=${p.status ?? "Available"}`;
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

  const PLAYER_INTENT_PATTERN = /\b(transfer|captain|buy|sell|form|price|value|fdr|fixture|recommend|differential|who should|upgrade|downgrade|replace|pick|squad|bench|chip|wildcard|free hit|triple captain|bench boost)\b/i;
  const isPlayerQuery = PLAYER_INTENT_PATTERN.test(message) || mentionedNames.length > 0;

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
Team ID (entryId): ${teamId || "Unknown"}
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
3. **PLAYER IDENTITY: USE full_name ONLY.** Every tool result includes a \`full_name\` field (e.g. "Ivan Toney") and a \`name\` field which is the FPL short display name (e.g. "Toney"). Always refer to players by their \`full_name\`. Never remark on, qualify, or mention the \`name\`/web_name field. Never substitute your own knowledge of who a player might be — if the tool says the player is "Thiago Andrade", present them as "Thiago Andrade", not as someone else you recognise.
4. **POSITION IS FROM TOOL DATA ONLY.** A player's position (GKP/DEF/MID/FWD) must come from the \`position\` field in a tool result or the LIVE PLAYER DATA block below. Never use your training knowledge to infer or assume a player's position — players change positions between seasons and your training data will be wrong. If a tool says a player is MID, they are MID, even if you believe they are a FWD.
5. **NO ASSUMPTION ON SET PIECES OR TEAM.** Never state a player is a penalty/free-kick taker, or name their club, unless a tool result confirms it.
6. **NO UNAVAILABILITY EXCUSES FOR xG/xA.** analyzePlayer always returns xG_per_90, xA_per_90, and xGI_per_90 from FPL match history. Never tell a user this data is unavailable.
7. **ROTATION RISK CAVEAT.** If a player's archetype is "Rotation Risk", flag that their per-90 stats are inflated by limited minutes whenever you cite them.

=== 2. TOOL USE POLICY ===
- **MANDATORY LOOKUP:** Any claim about price, form, xG, fixtures, availability, yellow/red cards, archetype, or **position** requires a tool call in this conversation first. This includes transfer suggestions — never recommend a player as a replacement without first confirming their position via a tool result matches the player being replaced.
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

=== 3. SQUAD RECOMMENDATION CASCADE ===
When asked to recommend a player replacement, transfer, or squad selection, you MUST follow these steps in order:
1. **REQUIRE SQUAD CONTEXT:** Check if the \`USER'S SQUAD CONTEXT\` is available below (including Team ID). If it is NOT available, **STOP**. Do not suggest any players. Politely ask the user to enter their Team ID in the Match Centre first so you can give personalized advice.
2. **REQUIRE TOOL VALIDATION:** Once you have a target player in mind, you must retrieve their live data (using \`analyzePlayer\` or \`filterPlayers\`) to ensure you have their *current* team, price, and position. Do not rely on your training data.
3. **CHECK NON-REDUNDANCY:** Cross-reference the live target player with the \`USER'S SQUAD CONTEXT\`. If the player is already in the squad, discard them and find a different target.
4. **CHECK 3-PLAYER CLUB LIMIT:** Count how many players from the target player's *current live team* are already in the user's squad. If the user already has 3 players from that club, the transfer is invalid. Discard them and find a different target.
5. **SIMULATE AND VERIFY:** Before finalizing the recommendation, you MUST call the \`simulateTransfers\` tool (passing the \`entryId\`). This mathematically verifies the budget, position limits, and team limits, and gets a value comparison. Only recommend the transfer if the tool confirms it is valid.

=== 4. SQUAD & TRANSFER LOGIC ===
${budgetRule}
- **AVAILABILITY FIRST:** Always verify injury/suspension status before recommending any player.
- **FIXTURE HORIZON:** Assess 3–5 GWs of fixtures, not just the next one. Explicitly warn about short-term punts.
- **METRIC JUSTIFICATION:** Back every recommendation with specific numbers from tool results (e.g. xG, FDR, reliability, value score).

=== 5. METRIC REFERENCE ===
Archetypes — Talisman: consistent starter with returns | Flat Track Bully: scores vs easy opponents, blanks vs tough | Workhorse: reliable minutes, low ceiling | Rotation Risk: strong per-90 but frequently benched.
xPP90: expected points per 90 minutes — 70% weighted on underlying stats (xG, xA, xGC) + 30% actual performance. Higher than raw PP90 means the player is an underlier due a correction; lower means they have been overperforming their underlying stats.
xG_per_90 / xA_per_90 / xGI_per_90: expected goals/assists/goal involvement per 90, from FPL match history.
Reliability: fraction of expected minutes played (>0.8 = nailed; <0.6 = rotation risk).
Start rate: fraction of appearances as a starter — prefer this over reliability when explaining to users.
Efficiency rating: total points per £m spent.
ep_next: FPL's expected points for next GW — use as a captaincy sanity check.
xGC_per_90: expected goals conceded per 90 — key for DEF/GKP clean sheet potential.
yellow_cards / red_cards: returned by analyzePlayer. PL ban thresholds: 5 yellows before GW19, 10 before GW32, 15 anytime.
When explaining a metric, call analyzePlayer first, then give one sentence defining it and one sentence interpreting that player's actual number.

=== 6. RESPONSE FORMAT & TONE (CRITICAL) ===
- **BE CONCISE.** Give direct answers without preamble, step-by-step reasoning narration, or meta-commentary about what you're doing. Cut the process — keep the conclusion.
- **INCLUDE SUPPORTING NUMBERS.** Always include the key stats that justify a recommendation (e.g. FDR, xG, form, price). The user needs data to trust the advice, not just a verdict.
- **NO METRIC DEFINITIONS.** Do not define metrics (like xG, reliability, FDR) unless the user explicitly asks "why?" or "what does that mean?".
- Use bullet points and bold headers. No walls of text.
- Player comparisons: always use a markdown table (players as columns, metrics as rows).
- End every response with one specific, contextual follow-up question — never a generic "anything else?".
- For vague questions ("Who should I buy?"), ask one clarifying question to narrow scope before fetching data.
- If a tool fails, give general tactical advice — never expose raw error messages to the user.
${squadSection}${gwSection}${livePlayerSection}`;

  return { systemInstruction, tools, isPlayerQuery };
}
