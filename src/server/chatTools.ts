import { FPL_HEADERS, playerSummariesCache, injuryPeriodsCache } from "./cache";

function normalizePlayerName(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

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

const FUZZY_AUTO_THRESHOLD = 3;

interface FuzzyPlayerResult {
  player: any | null;
  exact: boolean;
  candidates: any[];
}

export function fuzzyFindPlayer(query: string, players: any[]): FuzzyPlayerResult {
  const normQuery = normalizePlayerName(query);

  const substringMatches = players.filter((p: any) => {
    const normWeb = normalizePlayerName(p.web_name);
    const normFull = normalizePlayerName(`${p.first_name} ${p.second_name}`);
    return normWeb.includes(normQuery) || normFull.includes(normQuery);
  });
  if (substringMatches.length === 1) return { player: substringMatches[0], exact: true, candidates: [] };
  if (substringMatches.length > 1) {
    return { player: substringMatches[0], exact: true, candidates: substringMatches.slice(1, 4) };
  }

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
    return { player: best.player, exact: false, candidates: scored.slice(1, 3).map(s => s.player) };
  }

  return { player: null, exact: false, candidates: scored.slice(0, 3).map(s => s.player) };
}

export async function toolGetPlayerStats({ position, maxCost, minForm }: { position?: string; maxCost?: number; minForm?: number }) {
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

export async function toolGetUpcomingFixtures({ teamName, games }: { teamName?: string; games?: number }) {
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

export async function toolAnalyzePlayer({ playerName }: { playerName: string }) {
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

  const mins = player.minutes || 1;
  const xG_per_90 = parseFloat(((parseFloat(player.expected_goals || "0") / mins) * 90).toFixed(2));
  const xA_per_90 = parseFloat(((parseFloat(player.expected_assists || "0") / mins) * 90).toFixed(2));
  const xGI_per_90 = parseFloat(((parseFloat(player.expected_goal_involvements || "0") / mins) * 90).toFixed(2));

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

let pricePredictionsCache: { data: any; fetchedAt: number } | null = null;
const PRICE_CACHE_TTL = 1000 * 60 * 60 * 2;

export async function toolGetPriceChanges() {
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

    const risen = players
      .filter((p: any) => p.cost_change_event > 0)
      .sort((a: any, b: any) => b.cost_change_event - a.cost_change_event)
      .slice(0, 10)
      .map((p: any) => ({
        name: p.web_name, team: teamMap[p.team],
        current_price: (p.now_cost / 10).toFixed(1),
        price_change: `+${(p.cost_change_event / 10).toFixed(1)}`,
        net_transfers_this_gw: p.transfers_in_event - p.transfers_out_event
      }));

    const fallen = players
      .filter((p: any) => p.cost_change_event < 0)
      .sort((a: any, b: any) => a.cost_change_event - b.cost_change_event)
      .slice(0, 10)
      .map((p: any) => ({
        name: p.web_name, team: teamMap[p.team],
        current_price: (p.now_cost / 10).toFixed(1),
        price_change: (p.cost_change_event / 10).toFixed(1),
        net_transfers_this_gw: p.transfers_in_event - p.transfers_out_event
      }));

    const trending_in = players
      .filter((p: any) => p.cost_change_event === 0)
      .sort((a: any, b: any) => (b.transfers_in_event - b.transfers_out_event) - (a.transfers_in_event - a.transfers_out_event))
      .slice(0, 10)
      .map((p: any) => ({
        name: p.web_name, team: teamMap[p.team],
        current_price: (p.now_cost / 10).toFixed(1),
        transfers_in: p.transfers_in_event, transfers_out: p.transfers_out_event,
        net_transfers: p.transfers_in_event - p.transfers_out_event
      }));

    const result = { risen_this_gw: risen, fallen_this_gw: fallen, trending_in_may_rise: trending_in, fetched_at: new Date().toISOString() };
    pricePredictionsCache = { data: result, fetchedAt: now };
    return result;
  } catch (err: any) {
    return { error: `Could not fetch price data: ${err.message}` };
  }
}

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

export async function toolGetDeepStats({ playerName }: { playerName: string }) {
  try {
    const players = await getUnderstatPlayers();
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
      name: match.player_name, team: match.team_title, position: match.position, season: "2024-25",
      games: match.games, minutes: match.time, goals: match.goals, assists: match.assists,
      xG: parseFloat(match.xG).toFixed(2), xA: parseFloat(match.xA).toFixed(2),
      npxG: parseFloat(match.npxG).toFixed(2),
      xG_per_90: parseFloat(((parseFloat(match.xG) / mins) * 90).toFixed(2)),
      xA_per_90: parseFloat(((parseFloat(match.xA) / mins) * 90).toFixed(2)),
      npxG_per_90: parseFloat(((parseFloat(match.npxG) / mins) * 90).toFixed(2)),
      xGI_per_90: parseFloat((((parseFloat(match.xG) + parseFloat(match.xA)) / mins) * 90).toFixed(2)),
      xGChain_per_90: parseFloat(((parseFloat(match.xGChain) / mins) * 90).toFixed(2)),
      shots: match.shots, shots_per_game: parseFloat((parseFloat(match.shots) / games).toFixed(1)),
      key_passes: match.key_passes, key_passes_per_game: parseFloat((parseFloat(match.key_passes) / games).toFixed(1)),
      yellow_cards: match.yellow_cards, red_cards: match.red_cards,
      xG_overperformance: parseFloat((parseFloat(match.goals) - parseFloat(match.xG)).toFixed(2)),
      ...(autoMatchNote ? { auto_matched_from: autoMatchNote } : {})
    };
  } catch (err: any) {
    return { error: `Failed to fetch deep stats: ${err.message}` };
  }
}

export async function toolGetInjuryNews({ teamName }: { teamName?: string }) {
  const response = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
  const data = await response.json();
  const teams: any[] = data.teams;
  const teamMap: Record<number, string> = {};
  teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

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
        name: p.web_name, team: teamMap[p.team],
        status: statusLabel[p.status] || p.status,
        chance_of_playing_next_round: p.chance_of_playing_next_round ?? 100,
        news: p.news || "No news",
        injured_since_gw: currentInjury?.start_event ?? null
      };
    })
    .sort((a: any, b: any) => a.chance_of_playing_next_round - b.chance_of_playing_next_round);

  return { total_flagged: flagged.length, players: flagged, as_of: new Date().toISOString() };
}
