import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile,
} from "./src/utils/metrics.ts";

const BASE_URL = process.env.FPL_SERVER_URL ?? "http://localhost:3000";

const POSITION_MAP: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

// --- Helpers ---

async function fetchJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
  return res.json();
}

async function getBootstrap() {
  return fetchJson("/api/fpl/bootstrap");
}

function resolvePlayer(nameOrId: string | number, players: any[]): any | null {
  if (typeof nameOrId === "number" || /^\d+$/.test(String(nameOrId))) {
    return players.find((p) => p.id === Number(nameOrId)) ?? null;
  }
  const query = String(nameOrId).toLowerCase();
  return (
    players.find((p) => p.web_name.toLowerCase() === query) ??
    players.find((p) =>
      `${p.first_name} ${p.second_name}`.toLowerCase().includes(query)
    ) ??
    null
  );
}

function buildTfdrMap(teams: any[], fixtures: any[]) {
  const standings = calculateLiveStandings(fixtures);
  const rawTfdrMap: Record<number, any> = {};

  for (const t of teams) {
    const st = standings[t.id] ?? {
      position: 10,
      rank_attack_home: 10, rank_attack_away: 10, rank_attack_overall: 10,
      rank_defense_home: 10, rank_defense_away: 10, rank_defense_overall: 10,
    };
    rawTfdrMap[t.id] = {
      home: {
        defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_home, calculateAttackForm(t.id, fixtures, "home")),
        attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_home, calculateDefenseForm(t.id, fixtures, "home"), true),
        overall: calculateRawTFDR(t.strength, st.position, calculateAttackForm(t.id, fixtures, "home")),
      },
      away: {
        defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_away, calculateAttackForm(t.id, fixtures, "away")),
        attack_fdr: calculateRawTFDR(t.strength, st.rank_defense_away, calculateDefenseForm(t.id, fixtures, "away"), true),
        overall: calculateRawTFDR(t.strength, st.position, calculateAttackForm(t.id, fixtures, "away")),
      },
    };
  }
  normalizeTFDRMap(rawTfdrMap);
  return rawTfdrMap;
}

function txt(lines: string[]) {
  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

// --- MCP Server ---

const server = new McpServer({
  name: "fpl",
  version: "1.0.0",
});

server.tool(
  "get_players",
  "Get all FPL players with key stats. Optionally filter by position, max cost, or min form.",
  {
    position: z.enum(["GKP", "DEF", "MID", "FWD"]).optional().describe("Filter by position"),
    max_cost: z.number().optional().describe("Max cost in £ millions (e.g. 6.5)"),
    min_form: z.number().optional().describe("Minimum form value"),
  },
  async ({ position, max_cost, min_form }) => {
    try {
      const bootstrap = await getBootstrap();
      const teamMap: Record<number, string> = {};
      for (const t of bootstrap.teams) teamMap[t.id] = t.short_name;

      let players = bootstrap.elements.map((p: any) => ({
        name: p.web_name,
        team: teamMap[p.team] ?? p.team,
        position: POSITION_MAP[p.element_type],
        cost_m: p.now_cost / 10,
        form: parseFloat(p.form),
        ep_next: parseFloat(p.ep_next),
        total_points: p.total_points,
        selected_by_pct: parseFloat(p.selected_by_percent),
        status: p.status,
        news: p.news || null,
      }));

      if (position) players = players.filter((p: any) => p.position === position);
      if (max_cost != null) players = players.filter((p: any) => p.cost_m <= max_cost);
      if (min_form != null) players = players.filter((p: any) => p.form >= min_form);

      const lines = [
        `${players.length} players | columns: name, team, pos, cost, form, ep_next, total_pts, sel%, status`,
        ...players.map((p: any) =>
          `${p.name} | ${p.team} | ${p.position} | £${p.cost_m}m | form:${p.form} | ep:${p.ep_next} | ${p.total_points}pts | ${p.selected_by_pct}% | ${p.status}${p.news ? ` | ${p.news}` : ""}`
        ),
      ];

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "get_fixtures",
  "Get upcoming FPL fixtures. Optionally filter by gameweek(s) or team ID.",
  {
    gameweeks: z.array(z.number()).optional().describe("Specific gameweek numbers to include"),
    team_id: z.number().optional().describe("Filter to fixtures involving this team ID"),
  },
  async ({ gameweeks, team_id }) => {
    try {
      const [bootstrap, fixtures] = await Promise.all([getBootstrap(), fetchJson("/api/fpl/fixtures")]);
      const teamMap: Record<number, string> = {};
      for (const t of bootstrap.teams) teamMap[t.id] = t.short_name;

      let upcoming = fixtures.filter((f: any) => !f.finished);
      if (gameweeks?.length) upcoming = upcoming.filter((f: any) => gameweeks.includes(f.event));
      if (team_id != null) upcoming = upcoming.filter((f: any) => f.team_h === team_id || f.team_a === team_id);

      const lines = [
        `${upcoming.length} fixtures | columns: GW, home(diff) vs away(diff), kickoff`,
        ...upcoming.map((f: any) =>
          `GW${f.event} | ${teamMap[f.team_h]}(${f.team_h_difficulty}) vs ${teamMap[f.team_a]}(${f.team_a_difficulty}) | ${f.kickoff_time?.substring(0, 10) ?? "TBC"}`
        ),
      ];

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "get_player_detail",
  "Get match history and upcoming fixtures for a player. Accepts player name or ID.",
  {
    player: z.union([z.string(), z.number()]).describe("Player name (e.g. 'Salah') or numeric ID"),
    last_n_games: z.number().optional().describe("Only return the last N gameweeks of history (omit for full season)"),
  },
  async ({ player, last_n_games }) => {
    try {
      const bootstrap = await getBootstrap();
      const match = resolvePlayer(player, bootstrap.elements);
      if (!match) return { isError: true, content: [{ type: "text", text: `Player not found: ${player}` }] };

      const summary = await fetchJson(`/api/fpl/player-summary/${match.id}`);
      const teamMap: Record<number, string> = {};
      for (const t of bootstrap.teams) teamMap[t.id] = t.short_name;

      let history = summary.history;
      if (last_n_games != null) history = history.slice(-last_n_games);

      const historyLines = history.map((h: any) => {
        const venue = h.was_home ? "H" : "A";
        const started = h.starts === 1 ? "start" : "sub";
        const inv = `${h.goals_scored}G ${h.assists}A`;
        const xInv = `xG:${parseFloat(h.expected_goals).toFixed(2)} xA:${parseFloat(h.expected_assists).toFixed(2)}`;
        const cards = h.yellow_cards ? ` Y${h.yellow_cards}` : "";
        return `GW${h.round} vs ${teamMap[h.opponent_team] ?? h.opponent_team}(${venue}) | ${started} ${h.minutes}min | ${inv} | bonus:${h.bonus} | ${h.total_points}pts | ${xInv}${cards}`;
      });

      const fixtureLines = summary.fixtures.map((f: any) =>
        `GW${f.event ?? "?"} vs ${teamMap[f.opponent_team] ?? f.opponent_team}(${f.is_home ? "H" : "A"}) | diff:${f.difficulty} | ${f.kickoff_time?.substring(0, 10) ?? "TBC"}`
      );

      const lines = [
        `${match.web_name} | ${teamMap[match.team]} | ${POSITION_MAP[match.element_type]} | £${match.now_cost / 10}m | status:${match.status}${match.news ? ` | ${match.news}` : ""}`,
        "",
        `HISTORY (${historyLines.length} games${last_n_games ? `, last ${last_n_games}` : ""}):`,
        ...historyLines,
        "",
        `UPCOMING FIXTURES:`,
        ...fixtureLines,
      ];

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "analyze_player",
  "Compute a full performance profile for a player: archetype, PP90 by fixture difficulty, reliability score, and efficiency rating.",
  {
    player: z.union([z.string(), z.number()]).describe("Player name (e.g. 'Haaland') or numeric ID"),
  },
  async ({ player }) => {
    try {
      const [bootstrap, allFixtures] = await Promise.all([
        getBootstrap(),
        fetchJson("/api/fpl/fixtures"),
      ]);

      const match = resolvePlayer(player, bootstrap.elements);
      if (!match) return { isError: true, content: [{ type: "text", text: `Player not found: ${player}` }] };

      const summary = await fetchJson(`/api/fpl/player-summary/${match.id}`);
      if (!summary?.history?.length) {
        return { isError: true, content: [{ type: "text", text: `No history data for ${match.web_name}` }] };
      }

      const teamMap: Record<number, string> = {};
      for (const t of bootstrap.teams) teamMap[t.id] = t.short_name;

      const tfdrMap = buildTfdrMap(bootstrap.teams, allFixtures);
      const p = calculatePerformanceProfile(
        summary.history, allFixtures, tfdrMap, match.status, 3, 270, match.element_type
      );

      const lines = [
        `${match.web_name} | ${teamMap[match.team]} | ${POSITION_MAP[match.element_type]} | £${match.now_cost / 10}m`,
        `Archetype: ${p.archetype} — ${p.archetype_blurb}`,
        `Base PP90: ${p.base_pp90.toFixed(2)} | Reliability: ${p.reliability_score.toFixed(2)} | Efficiency: ${p.efficiency_rating.toFixed(2)}`,
        `PP90 by difficulty: FDR2=${p.pp90_fdr2 ?? "n/a"} FDR3=${p.pp90_fdr3 ?? "n/a"} FDR4=${p.pp90_fdr4 ?? "n/a"} FDR5=${p.pp90_fdr5 ?? "n/a"}`,
        `Appearances: ${p.appearances} | Total minutes: ${p.total_minutes}`,
      ];

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "get_team",
  "Get an FPL manager's team info, GW history, and optionally their picks for a specific gameweek.",
  {
    entry_id: z.number().describe("The FPL manager's team ID"),
    event: z.number().optional().describe("Gameweek number to fetch picks for"),
  },
  async ({ entry_id, event }) => {
    try {
      const [entry, history, bootstrap] = await Promise.all([
        fetchJson(`/api/fpl/entry/${entry_id}`),
        fetchJson(`/api/fpl/entry/${entry_id}/history`),
        getBootstrap(),
      ]);

      const playerMap: Record<number, string> = {};
      for (const p of bootstrap.elements) playerMap[p.id] = p.web_name;

      const gwLines = history.current.map((gw: any) =>
        `GW${gw.event} | ${gw.points}pts | total:${gw.total_points} | rank:${gw.rank} | transfers:${gw.event_transfers}(-${gw.event_transfers_cost}pts)`
      );

      const lines = [
        `${entry.name} | ${entry.player_first_name} ${entry.player_last_name}`,
        `Overall: ${entry.summary_overall_points}pts | Rank: ${entry.summary_overall_rank?.toLocaleString()}`,
        "",
        "GW HISTORY:",
        ...gwLines,
      ];

      if (event != null) {
        const picks = await fetchJson(`/api/fpl/entry/${entry_id}/event/${event}/picks`);
        lines.push("", `GW${event} PICKS${picks.active_chip ? ` (chip: ${picks.active_chip})` : ""}:`);
        for (const pick of picks.picks) {
          const flags = [
            pick.is_captain ? "C" : "",
            pick.is_vice_captain ? "V" : "",
            pick.multiplier === 3 ? "TC" : "",
          ].filter(Boolean).join("");
          lines.push(`${pick.position}. ${playerMap[pick.element] ?? pick.element}${flags ? ` [${flags}]` : ""}`);
        }
      }

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "filter_players",
  "Filter FPL players by multiple combined criteria: position, max cost, min xG per 90, max upcoming FDR, club, min reliability, or archetype. Returns top 20 by value score.",
  {
    position: z.enum(["GKP", "DEF", "MID", "FWD"]).optional().describe("Position filter"),
    max_cost: z.number().optional().describe("Max price in £ millions"),
    min_xg_per_90: z.number().optional().describe("Minimum xG per 90 minutes"),
    max_upcoming_fdr: z.number().optional().describe("Maximum average upcoming fixture difficulty (1-5)"),
    team_id: z.number().optional().describe("FPL team ID to restrict to one club"),
    min_reliability: z.number().optional().describe("Minimum reliability score (0-1)"),
    archetype: z.string().optional().describe("Archetype: Talisman, Flat Track Bully, Workhorse, Rotation Risk"),
  },
  async ({ position, max_cost, min_xg_per_90, max_upcoming_fdr, team_id, min_reliability, archetype }) => {
    try {
      const result = await fetchJson(`/api/chat/tool/filterPlayers?position=${position ?? ""}&maxCost=${max_cost ?? ""}&minXgPer90=${min_xg_per_90 ?? ""}&maxUpcomingFdr=${max_upcoming_fdr ?? ""}&teamId=${team_id ?? ""}&minReliability=${min_reliability ?? ""}&archetype=${archetype ?? ""}`).catch(() => null);

      // Fallback: compute directly
      const [bootstrap, allFixtures] = await Promise.all([getBootstrap(), fetchJson("/api/fpl/fixtures")]);
      const teamMap: Record<number, string> = {};
      for (const t of bootstrap.teams) teamMap[t.id] = t.short_name;
      const tfdrMap = buildTfdrMap(bootstrap.teams, allFixtures);
      const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
      const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

      let players = bootstrap.elements as any[];
      if (position) players = players.filter((p: any) => p.element_type === positionMap[position]);
      if (max_cost != null) players = players.filter((p: any) => p.now_cost <= max_cost * 10);
      if (team_id != null) players = players.filter((p: any) => p.team === team_id);
      if (min_xg_per_90 != null) {
        players = players.filter((p: any) => {
          const mins = p.minutes || 1;
          return (parseFloat(p.expected_goals || "0") / mins) * 90 >= min_xg_per_90!;
        });
      }

      const summaries: Record<number, any> = await fetchJson("/api/fpl/summaries-cache").catch(() => ({}));

      const enriched = players
        .filter((p: any) => summaries[p.id]?.history?.length >= 3)
        .map((p: any) => {
          const summary = summaries[p.id];
          const perf = summary ? calculatePerformanceProfile(summary.history, allFixtures, tfdrMap, p.status, 3, 270, p.element_type) : null;
          const mins = p.minutes || 1;
          const form = parseFloat(p.form);
          const priceEst = p.now_cost / 20;
          const fallback = perf?.base_pp90 ?? (form || priceEst);

          const { getNextFixtures: gnf } = require("./src/utils/fixtures.ts");
          const nextFix = gnf(p.team, allFixtures, bootstrap.teams, tfdrMap, 5, 0, p.element_type);
          const avgFdr = nextFix.length > 0
            ? parseFloat((nextFix.reduce((s: number, f: any) => s + f.difficulty, 0) / nextFix.length).toFixed(2))
            : 3;

          let xPts5 = 0;
          for (const f of nextFix) {
            if (f.isBlank) continue;
            const k = Math.round(Math.max(2, Math.min(5, f.difficulty))) as 2 | 3 | 4 | 5;
            const pp = ({ 2: perf?.pp90_fdr2, 3: perf?.pp90_fdr3, 4: perf?.pp90_fdr4, 5: perf?.pp90_fdr5 }[k] ?? fallback);
            xPts5 += f.isDouble ? pp * 2 : pp;
          }
          const rel = perf ? perf.reliability_score : 1;
          const avail = (p.status === "i" && p.minutes === 0) ? 0 : 1;
          const ppg = parseFloat(p.points_per_game) || priceEst;
          const valueScore = parseFloat(((xPts5 * 0.75 + ppg * 5 * 0.25) * rel * avail).toFixed(2));

          return { ...p, avgFdr, valueScore, perf };
        })
        .filter((p: any) => {
          if (p.valueScore <= 0) return false;
          if (max_upcoming_fdr != null && p.avgFdr > max_upcoming_fdr) return false;
          if (min_reliability != null && (p.perf?.reliability_score ?? 1) < min_reliability) return false;
          if (archetype) {
            const norm = archetype.toLowerCase();
            if (!p.perf?.archetype?.toLowerCase().includes(norm)) return false;
          }
          return true;
        })
        .sort((a: any, b: any) => b.valueScore - a.valueScore)
        .slice(0, 20);

      const lines = [
        `${enriched.length} players matching filters`,
        "name | team | pos | cost | valueScore | archetype | reliability | fdr | form | xG/90",
        ...enriched.map((p: any) => {
          const xgP90 = parseFloat(((parseFloat(p.expected_goals || "0") / (p.minutes || 1)) * 90).toFixed(2));
          return `${p.web_name} | ${teamMap[p.team]} | ${positionLabel[p.element_type]} | £${(p.now_cost / 10).toFixed(1)}m | ${p.valueScore} | ${p.perf?.archetype ?? "n/a"} | rel:${(p.perf?.reliability_score ?? 1).toFixed(2)} | fdr:${p.avgFdr} | form:${p.form} | xG/90:${xgP90}`;
        }),
      ];
      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "explain_fdr",
  "Explain why a team's fixture difficulty is rated as it is for a given gameweek. Breaks down TFDR inputs: opponent league position, attack/defense form, home/away context, and normalized scores.",
  {
    team: z.union([z.string(), z.number()]).describe("Team name (e.g. 'Arsenal') or team ID"),
    gameweek: z.number().optional().describe("Gameweek to explain (defaults to current GW)"),
  },
  async ({ team: teamQuery, gameweek }) => {
    try {
      const [bootstrap, allFixtures] = await Promise.all([getBootstrap(), fetchJson("/api/fpl/fixtures")]);
      const teams: any[] = bootstrap.teams;
      const teamMap: Record<number, string> = {};
      for (const t of teams) teamMap[t.id] = t.short_name;

      const found = typeof teamQuery === "number"
        ? teams.find((t: any) => t.id === teamQuery)
        : teams.find((t: any) =>
            t.name.toLowerCase().includes(String(teamQuery).toLowerCase()) ||
            t.short_name.toLowerCase() === String(teamQuery).toLowerCase()
          );
      if (!found) return { isError: true, content: [{ type: "text", text: `Team not found: ${teamQuery}` }] };

      const currentGW: number = bootstrap.events?.find((e: any) => e.is_current)?.id
        || bootstrap.events?.find((e: any) => e.is_next)?.id || 1;
      const targetGW = gameweek ?? currentGW;

      const tfdrMap = buildTfdrMap(teams, allFixtures);
      const { calculateLiveStandings: cls } = await import("./src/utils/metrics.ts");
      const standings = cls(allFixtures);
      const st = standings[found.id] ?? { position: 10 };

      const gw_fixtures = allFixtures.filter((f: any) =>
        !f.finished && f.event === targetGW && (f.team_h === found.id || f.team_a === found.id)
      );

      if (gw_fixtures.length === 0) {
        return txt([`${found.name} — GW${targetGW}: No fixture (blank gameweek or already played).`]);
      }

      const lines: string[] = [`${found.name} (${found.short_name}) — GW${targetGW} fixture breakdown`, ""];
      for (const f of gw_fixtures) {
        const isHome = f.team_h === found.id;
        const oppId = isHome ? f.team_a : f.team_h;
        const oppName = teamMap[oppId] ?? String(oppId);
        const ctx = isHome ? "home" : "away";
        const tfdr = tfdrMap[found.id];
        const oppSt = standings[oppId] ?? { position: 10 };
        const oppFixtures = allFixtures.filter((x: any) => x.finished && (x.team_h === oppId || x.team_a === oppId)).slice(-5);
        const oppScored = oppFixtures.reduce((s: number, x: any) => s + (x.team_h === oppId ? x.team_h_score : x.team_a_score), 0);
        const oppConceded = oppFixtures.reduce((s: number, x: any) => s + (x.team_h === oppId ? x.team_a_score : x.team_h_score), 0);

        lines.push(`vs ${oppName} (${isHome ? "H" : "A"}) | FPL diff: ${isHome ? f.team_h_difficulty : f.team_a_difficulty}`);
        lines.push(`  TFDR — attack_fdr: ${tfdr?.[ctx]?.attack_fdr?.toFixed(2) ?? "n/a"} | defense_fdr: ${tfdr?.[ctx]?.defense_fdr?.toFixed(2) ?? "n/a"} | overall: ${tfdr?.[ctx]?.overall?.toFixed(2) ?? "n/a"}`);
        lines.push(`  ${oppName} context: league pos ${oppSt.position} | last 5: scored ${oppScored}, conceded ${oppConceded}`);
        lines.push(`  For attackers: attack_fdr ${tfdr?.[ctx]?.attack_fdr?.toFixed(1) ?? "?"} (${parseFloat(tfdr?.[ctx]?.attack_fdr ?? "3") <= 2.5 ? "easy" : parseFloat(tfdr?.[ctx]?.attack_fdr ?? "3") >= 3.5 ? "tough" : "medium"})`);
        lines.push(`  For defenders: defense_fdr ${tfdr?.[ctx]?.defense_fdr?.toFixed(1) ?? "?"} (${parseFloat(tfdr?.[ctx]?.defense_fdr ?? "3") <= 2.5 ? "good CS chance" : parseFloat(tfdr?.[ctx]?.defense_fdr ?? "3") >= 3.5 ? "tough CS" : "medium CS chance"})`);
      }

      lines.push("", "TFDR = opponent league position + attack/defense form (goals last 5) + team strength, normalized 1-5 across all clubs.");
      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "simulate_transfers",
  "Validate and evaluate proposed FPL transfers. Checks position match, 3-per-club rule, and budget. Compares valueScore (expected pts over next 5 GWs) for players in vs out.",
  {
    entry_id: z.number().describe("FPL team ID of the manager"),
    transfers_out: z.array(z.string()).describe("Player names to transfer out"),
    transfers_in: z.array(z.string()).describe("Player names to transfer in (same order as transfers_out)"),
    free_transfers: z.number().optional().describe("Number of free transfers available (default: 1)"),
  },
  async ({ entry_id, transfers_out, transfers_in, free_transfers = 1 }) => {
    try {
      if (transfers_out.length !== transfers_in.length) {
        return { isError: true, content: [{ type: "text", text: "transfers_out and transfers_in must have the same length." }] };
      }

      const [bootstrap, allFixtures] = await Promise.all([getBootstrap(), fetchJson("/api/fpl/fixtures")]);
      const teams: any[] = bootstrap.teams;
      const allPlayers: any[] = bootstrap.elements;
      const teamMap: Record<number, string> = {};
      for (const t of teams) teamMap[t.id] = t.short_name;
      const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];
      const tfdrMap = buildTfdrMap(teams, allFixtures);

      const currentGW: number = bootstrap.events?.find((e: any) => e.is_current)?.id
        || bootstrap.events?.find((e: any) => e.is_next)?.id || 1;

      let currentSquad: any[] = [];
      let bankValue = 0;
      try {
        const [picksData, histData] = await Promise.all([
          fetchJson(`/api/fpl/entry/${entry_id}/event/${currentGW}/picks`),
          fetchJson(`/api/fpl/entry/${entry_id}/history`)
        ]);
        currentSquad = picksData.picks?.map((pick: any) => allPlayers.find(p => p.id === pick.element) ?? { id: pick.element, team: 0 }) ?? [];
        bankValue = histData.current?.slice(-1)[0]?.bank ?? 0;
      } catch (_) {}

      const resolve = (name: string) => {
        const n = name.toLowerCase().trim();
        return allPlayers.find((p: any) =>
          p.web_name.toLowerCase() === n ||
          `${p.first_name} ${p.second_name}`.toLowerCase().includes(n)
        ) ?? null;
      };

      const { calculatePerformanceProfile: cpp } = await import("./src/utils/metrics.ts");
      const { getNextFixtures: gnf } = await import("./src/utils/fixtures.ts");

      const enrich = (p: any) => {
        const summary: any = null;
        const perf = summary ? cpp(summary.history, allFixtures, tfdrMap, p.status, 3, 270, p.element_type) : null;
        const priceEst = p.now_cost / 20;
        const fallback = perf?.base_pp90 ?? priceEst;
        const nextFix = gnf(p.team, allFixtures, teams, tfdrMap, 5, 0, p.element_type);
        let xPts5 = 0;
        for (const f of nextFix) {
          if (f.isBlank) continue;
          const k = Math.round(Math.max(2, Math.min(5, f.difficulty))) as 2 | 3 | 4 | 5;
          const pp = ({ 2: perf?.pp90_fdr2, 3: perf?.pp90_fdr3, 4: perf?.pp90_fdr4, 5: perf?.pp90_fdr5 }[k] ?? fallback);
          xPts5 += f.isDouble ? pp * 2 : pp;
        }
        const ppg = parseFloat(p.points_per_game) || priceEst;
        const valueScore = parseFloat(((xPts5 * 0.75 + ppg * 5 * 0.25)).toFixed(2));
        return { ...p, valueScore };
      };

      const lines: string[] = [`Transfer simulation for team ${entry_id} | GW${currentGW} | Bank: £${(bankValue / 10).toFixed(1)}m | Free transfers: ${free_transfers}`, ""];
      let totalNetGain = 0;

      for (let i = 0; i < transfers_out.length; i++) {
        const outP = resolve(transfers_out[i]);
        const inP = resolve(transfers_in[i]);
        if (!outP) { lines.push(`❌ OUT "${transfers_out[i]}" not found`); continue; }
        if (!inP) { lines.push(`❌ IN "${transfers_in[i]}" not found`); continue; }

        const errors: string[] = [];
        if (outP.element_type !== inP.element_type) errors.push(`Position mismatch: ${positionLabel[outP.element_type]} → ${positionLabel[inP.element_type]}`);
        const squadAfter = currentSquad.filter((p: any) => p.id !== outP.id);
        if (squadAfter.filter((p: any) => p.team === inP.team).length >= 3) errors.push(`Already 3 from ${teamMap[inP.team] ?? inP.team}`);
        const budget = (outP.now_cost ?? 0) + bankValue;
        if (inP.now_cost > budget) errors.push(`Budget: need £${(inP.now_cost / 10).toFixed(1)}m, have £${(budget / 10).toFixed(1)}m`);

        if (errors.length > 0) {
          lines.push(`❌ ${outP.web_name} → ${inP.web_name}: INVALID — ${errors.join("; ")}`);
          continue;
        }

        const eOut = enrich(outP);
        const eIn = enrich(inP);
        const net = parseFloat((eIn.valueScore - eOut.valueScore).toFixed(2));
        totalNetGain += net;
        const verdict = net >= 3 ? "Strong upgrade" : net >= 1 ? "Marginal upgrade" : net >= -1 ? "Coin flip" : "Downgrade";
        lines.push(`✅ ${outP.web_name}(${positionLabel[outP.element_type]}, £${(outP.now_cost / 10).toFixed(1)}m, val:${eOut.valueScore}) → ${inP.web_name}(${positionLabel[inP.element_type]}, £${(inP.now_cost / 10).toFixed(1)}m, val:${eIn.valueScore}) | net: ${net >= 0 ? "+" : ""}${net} | ${verdict}`);
      }

      const hits = Math.max(0, transfers_out.length - free_transfers);
      const hitCost = hits * 4;
      lines.push("", `Transfer hits: ${hits} (-${hitCost} pts) | Net value gain after hits: ${(totalNetGain - hitCost) >= 0 ? "+" : ""}${(totalNetGain - hitCost).toFixed(2)}`);
      lines.push((totalNetGain - hitCost) >= 2 ? "Verdict: Worth doing" : (totalNetGain - hitCost) >= 0 ? "Verdict: Marginal — your call" : "Verdict: Not recommended");

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

server.tool(
  "summarize_h2h",
  "Compare two FPL teams for a head-to-head gameweek matchup. Shows differential players, shared players, captaincy comparison, and overall value score edge.",
  {
    my_entry_id: z.number().describe("Your FPL team ID"),
    opponent_entry_id: z.number().describe("Opponent's FPL team ID"),
    gameweek: z.number().optional().describe("Gameweek number (defaults to current GW)"),
  },
  async ({ my_entry_id, opponent_entry_id, gameweek }) => {
    try {
      const [bootstrap, allFixtures] = await Promise.all([getBootstrap(), fetchJson("/api/fpl/fixtures")]);
      const teams: any[] = bootstrap.teams;
      const allPlayers: any[] = bootstrap.elements;
      const teamMap: Record<number, string> = {};
      for (const t of teams) teamMap[t.id] = t.short_name;
      const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

      const currentGW: number = bootstrap.events?.find((e: any) => e.is_current)?.id
        || bootstrap.events?.find((e: any) => e.is_next)?.id || 1;
      const gw = gameweek ?? currentGW;

      const tfdrMap = buildTfdrMap(teams, allFixtures);
      const { getNextFixtures: gnf } = await import("./src/utils/fixtures.ts");

      const enrich = (player: any) => {
        const priceEst = player.now_cost / 20;
        const nextFix = gnf(player.team, allFixtures, teams, tfdrMap, 5, 0, player.element_type);
        const ppg = parseFloat(player.points_per_game) || priceEst;
        const avgFdr = nextFix.filter((f: any) => !f.isBlank).length > 0
          ? parseFloat((nextFix.filter((f: any) => !f.isBlank).reduce((s: number, f: any) => s + f.difficulty, 0) / nextFix.filter((f: any) => !f.isBlank).length).toFixed(2))
          : 3;
        const valueScore = parseFloat((ppg * 5).toFixed(2));
        return { ...player, valueScore, avgFdr };
      };

      const fetchPicks = async (entryId: number) => {
        const [entry, picks] = await Promise.all([
          fetchJson(`/api/fpl/entry/${entryId}`),
          fetchJson(`/api/fpl/entry/${entryId}/event/${gw}/picks`)
        ]);
        return { entry, picks: picks.picks, chip: picks.active_chip };
      };

      const [myData, oppData] = await Promise.all([fetchPicks(my_entry_id), fetchPicks(opponent_entry_id)]);

      const buildPicks = (picks: any[]) => picks.map((pick: any) => {
        const p = allPlayers.find((x: any) => x.id === pick.element);
        if (!p) return null;
        const e = enrich(p);
        return { ...e, name: p.web_name, team: teamMap[p.team], pos: positionLabel[p.element_type], price: (p.now_cost / 10).toFixed(1), isCaptain: pick.is_captain, isVC: pick.is_vice_captain };
      }).filter(Boolean);

      const myPicks = buildPicks(myData.picks);
      const oppPicks = buildPicks(oppData.picks);
      const myIds = new Set(myPicks.map((p: any) => p.id));
      const oppIds = new Set(oppPicks.map((p: any) => p.id));

      const myDiff = myPicks.filter((p: any) => !oppIds.has(p.id)).sort((a: any, b: any) => b.valueScore - a.valueScore);
      const oppDiff = oppPicks.filter((p: any) => !myIds.has(p.id)).sort((a: any, b: any) => b.valueScore - a.valueScore);
      const shared = myPicks.filter((p: any) => oppIds.has(p.id)).sort((a: any, b: any) => b.valueScore - a.valueScore);

      const myCap = myPicks.find((p: any) => p.isCaptain);
      const oppCap = oppPicks.find((p: any) => p.isCaptain);
      const myTotal = myPicks.reduce((s: number, p: any) => s + p.valueScore, 0);
      const oppTotal = oppPicks.reduce((s: number, p: any) => s + p.valueScore, 0);

      const fmtP = (p: any) => `${p.name}(${p.pos}, ${p.team}, £${p.price}m, val:${p.valueScore}, fdr:${p.avgFdr})`;

      const lines = [
        `H2H GW${gw}: ${myData.entry.name} vs ${oppData.entry.name}`,
        `Value totals — You: ${myTotal.toFixed(1)} | Opp: ${oppTotal.toFixed(1)} | Edge: ${(myTotal - oppTotal) >= 0 ? "+" : ""}${(myTotal - oppTotal).toFixed(1)}`,
        "",
        `CAPTAINS — You: ${myCap ? fmtP(myCap) : "n/a"} | Opp: ${oppCap ? fmtP(oppCap) : "n/a"}${myCap?.id === oppCap?.id ? " (same captain)" : ""}`,
        "",
        `SHARED (${shared.length}): ${shared.map(fmtP).join(" | ")}`,
        "",
        `YOUR DIFFERENTIALS (${myDiff.length}): ${myDiff.map(fmtP).join(" | ")}`,
        "",
        `OPP DIFFERENTIALS (${oppDiff.length}): ${oppDiff.map(fmtP).join(" | ")}`,
        "",
        myTotal > oppTotal
          ? `Advantage: You (stronger squad by ${(myTotal - oppTotal).toFixed(1)} pts value). Monitor opp differentials: ${oppDiff.slice(0, 2).map((p: any) => p.name).join(", ")}.`
          : myTotal < oppTotal
          ? `Advantage: Opponent (stronger by ${(oppTotal - myTotal).toFixed(1)} pts value). Your key differentials: ${myDiff.slice(0, 2).map((p: any) => p.name).join(", ")}.`
          : "Evenly matched. Captaincy is the key differentiator."
      ];

      return txt(lines);
    } catch (err: any) {
      return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }
);

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
