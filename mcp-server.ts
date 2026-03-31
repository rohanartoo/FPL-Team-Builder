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

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
