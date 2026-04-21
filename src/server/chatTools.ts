import { FPL_HEADERS, playerSummariesCache, injuryPeriodsCache } from "./cache";
import {
  calculateLiveStandings,
  calculateAttackForm,
  calculateDefenseForm,
  calculateRawTFDR,
  normalizeTFDRMap,
  calculatePerformanceProfile
} from "../utils/metrics";
import { getNextFixtures } from "../utils/fixtures";
import { getPlayerFlags } from "../utils/playerSignals";
import { computePositionThresholds } from "../utils/playerThresholds";
import { calculateLast5Metrics, isLongTermInjured } from "../utils/player";

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

// --- Shared TFDR map builder (1-hour cache) ---
let tfdrMapCache: { map: Record<number, any>; teams: any[]; fixtures: any[]; builtAt: number } | null = null;
const TFDR_CACHE_TTL = 1000 * 60 * 60;

async function buildTfdrMap() {
  if (tfdrMapCache && Date.now() - tfdrMapCache.builtAt < TFDR_CACHE_TTL) return tfdrMapCache;

  const [bootstrapRes, fixturesRes] = await Promise.all([
    fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS }),
    fetch("https://fantasy.premierleague.com/api/fixtures/", { headers: FPL_HEADERS })
  ]);
  if (!bootstrapRes.ok || !fixturesRes.ok) throw new Error("Failed to fetch FPL data for TFDR map");

  const bootstrapData = await bootstrapRes.json();
  const allFixtures: any[] = await fixturesRes.json();
  const allTeams: any[] = bootstrapData.teams;

  const standings = calculateLiveStandings(allFixtures);
  const rawMap: Record<number, any> = {};

  allTeams.forEach((t: any) => {
    const st = standings[t.id] || {
      position: 10,
      rank_attack_home: 10, rank_attack_away: 10,
      rank_defense_home: 10, rank_defense_away: 10
    };
    const attackFormHome = calculateAttackForm(t.id, allFixtures, 'home');
    const defenseFormHome = calculateDefenseForm(t.id, allFixtures, 'home');
    const attackFormAway = calculateAttackForm(t.id, allFixtures, 'away');
    const defenseFormAway = calculateDefenseForm(t.id, allFixtures, 'away');
    rawMap[t.id] = {
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

  normalizeTFDRMap(rawMap);
  tfdrMapCache = { map: rawMap, teams: allTeams, fixtures: allFixtures, builtAt: Date.now() };
  return tfdrMapCache;
}

// --- Shared player enrichment for server-side tools ---
function enrichPlayerServer(player: any, tfdrMap: Record<number, any>, teams: any[], fixtures: any[], gwHorizon = 5): any {
  const summary = playerSummariesCache[player.id];
  const nextFixtures = getNextFixtures(player.team, fixtures, teams, tfdrMap, gwHorizon, 0, player.element_type);
  const fdr = nextFixtures.length > 0
    ? parseFloat((nextFixtures.reduce((s: number, f: any) => s + f.difficulty, 0) / nextFixtures.length).toFixed(2))
    : 3;
  const fplForm = parseFloat(player.form);
  let perfProfile = summary?.history
    ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type, player)
    : null;

  const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
  const priceEstimate = player.now_cost / 20;
  const fallback = perfProfile?.base_pp90 ?? (fplForm || priceEstimate);
  const pp90At = (d: number) => {
    const k = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
    return ({ 2: perfProfile?.pp90_fdr2, 3: perfProfile?.pp90_fdr3, 4: perfProfile?.pp90_fdr4, 5: perfProfile?.pp90_fdr5 }[k] ?? fallback);
  };
  let xPts5GW = 0;
  for (const fix of nextFixtures) {
    if (fix.isBlank) continue;
    xPts5GW += fix.isDouble ? pp90At(fix.difficulty) * 2 : pp90At(fix.difficulty);
  }
  const reliability = hasReliableProfile ? perfProfile!.reliability_score : 1;
  const availabilityMultiplier = isLongTermInjured(player) ? 0 : 1;

  // Mid-week Fatigue & Rotation Risk (Level 3 Diagnostic)
  const ROTATION_HEAVY_TEAMS = [11, 13, 1, 6, 17, 14, 4]; // City, Liverpool, Arsenal, Chelsea, Spurs, Man Utd, Villa
  const news = (player.news || "").toLowerCase();
  const hasRotationKeywords = /rested|rotation|midweek|minutes|european|europe|doubts/.test(news);
  
  const lastMatch = summary?.history?.[summary.history.length - 1];
  const playedRecently = lastMatch && (Date.now() - new Date(lastMatch.kickoff_time).getTime() < 4 * 24 * 60 * 60 * 1000);
  const wasHeavilyUsed = lastMatch?.minutes >= 75;

  const isFatigued = hasRotationKeywords || (playedRecently && wasHeavilyUsed && ROTATION_HEAVY_TEAMS.includes(player.team));
  const isRotationRiskBase = reliability < 0.80 && ROTATION_HEAVY_TEAMS.includes(player.team);

  const seasonPPG = parseFloat(player.points_per_game) || priceEstimate;
  const basementFloor = seasonPPG * 5;
  const weightedScore = (xPts5GW * 0.75) + (basementFloor * 0.25);

  const xG = parseFloat(player.expected_goals ?? "0") || 0;
  const xGPer90 = player.minutes >= 90 ? (xG / player.minutes) * 90 : 0;
  const isDueAGoal = [3, 4].includes(player.element_type) && player.minutes >= 450
    && xGPer90 >= 0.25 && player.goals_scored < xG * 0.55;
  const isRegressionRisk = [3, 4].includes(player.element_type) && player.minutes >= 450
    && xG >= 2.0 && player.goals_scored > xG * 1.8;
  const signalMultiplier = isDueAGoal ? 1.15 : isRegressionRisk ? 0.85 : 1;

  return {
    ...player,
    fdr,
    fplForm,
    valueScore: parseFloat((weightedScore * reliability * availabilityMultiplier * signalMultiplier).toFixed(2)),
    perfProfile,
    rotation_risk: perfProfile?.rotation_risk_factor ? (isFatigued ? Math.min(1, perfProfile.rotation_risk_factor + 0.3) : perfProfile.rotation_risk_factor) : (isFatigued ? 0.3 : (isRotationRiskBase ? 0.2 : 0)),
    fatigue_risk: isFatigued || (perfProfile?.midweek_fatigue_risk ?? false)
  };
}

// --- New Tool: getRankedFixtures ---
export async function toolGetRankedFixtures({ games = 3, position }: { games?: number; position?: string }) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const teamMap: Record<number, any> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t; });

    const fdrKey = position === "attack" ? "attack_fdr" : position === "defense" ? "defense_fdr" : "overall";

    const ranked = teams.map((team: any) => {
      const nextFixtures = getNextFixtures(team.id, fixtures, teams, tfdrMap, games, 0);

      const fixtureDetails = nextFixtures.map((f: any) => {
        if (f.isBlank) {
          return { gw: f.event, opponent: "BLANK", home: null, difficulty: null, isBlank: true, isDouble: false };
        }
        const ctx = f.isHome ? 'away' : 'home';
        const opponentTeam = teams.find((t: any) => t.short_name === f.opponent);
        let diff = f.difficulty;
        if (opponentTeam && tfdrMap[opponentTeam.id]?.[ctx]?.[fdrKey] !== undefined) {
          diff = parseFloat(tfdrMap[opponentTeam.id][ctx][fdrKey].toFixed(1));
        }
        return {
          gw: f.event,
          opponent: f.opponent,
          home: f.isHome,
          difficulty: diff,
          isBlank: false,
          isDouble: f.isDouble ?? false
        };
      });

      const playableFixtures = fixtureDetails.filter((f: any) => !f.isBlank);
      const avg = playableFixtures.length > 0
        ? parseFloat((playableFixtures.reduce((s: number, f: any) => s + f.difficulty, 0) / playableFixtures.length).toFixed(2))
        : 5;

      return {
        team: team.name,
        short_name: team.short_name,
        avg_difficulty: avg,
        fixtures: fixtureDetails
      };
    }).sort((a: any, b: any) => a.avg_difficulty - b.avg_difficulty);

    const positionNote = position === "attack" ? " (attack view — harder for opposition defenders)"
      : position === "defense" ? " (defense view — easier for your defenders/keepers)"
      : "";

    return {
      games_assessed: games,
      position_context: position ?? "overall",
      note: `Lower difficulty = easier fixtures${positionNote}`,
      teams: ranked
    };
  } catch (err: any) {
    return { error: `Failed to rank fixtures: ${err.message}` };
  }
}

// --- New Tool: getValuePicks ---
export async function toolGetValuePicks({
  position, maxCost, minReliability, archetype
}: { position?: string; maxCost?: number; minReliability?: number; archetype?: string }) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    let candidates = allPlayers.filter(p => playerSummariesCache[p.id]?.history?.length >= 3);
    if (position && positionMap[position.toUpperCase()]) {
      candidates = candidates.filter(p => p.element_type === positionMap[position.toUpperCase()]);
    }
    if (maxCost) candidates = candidates.filter(p => p.now_cost <= maxCost * 10);

    const enriched = candidates.map(p => enrichPlayerServer(p, tfdrMap, teams, fixtures));

    let filtered = enriched.filter(p => p.valueScore > 0);
    if (minReliability) filtered = filtered.filter(p => (p.perfProfile?.reliability_score ?? 1) >= minReliability);
    if (archetype) {
      const norm = archetype.toLowerCase();
      filtered = filtered.filter(p => p.perfProfile?.archetype?.toLowerCase().includes(norm));
    }

    const top = filtered
      .sort((a: any, b: any) => b.valueScore - a.valueScore)
      .slice(0, 15)
      .map((p: any) => ({
        name: p.web_name,
        team: teamMap[p.team],
        position: positionLabel[p.element_type],
        price: (p.now_cost / 10).toFixed(1),
        value_score: p.valueScore,
        archetype: p.perfProfile?.archetype ?? "Not Enough Data",
        base_pp90: parseFloat((p.perfProfile?.base_pp90 ?? 0).toFixed(2)),
        reliability: parseFloat((p.perfProfile?.reliability_score ?? 0).toFixed(2)),
        fdr: p.fdr,
        fpl_form: p.fplForm,
        selected_by: p.selected_by_percent + "%",
        total_points: p.total_points
      }));

    return {
      filters_applied: { position: position ?? "all", maxCost: maxCost ?? "none", minReliability: minReliability ?? "none", archetype: archetype ?? "none" },
      count: top.length,
      players: top
    };
  } catch (err: any) {
    return { error: `Failed to get value picks: ${err.message}` };
  }
}

// --- New Tool: getSignalPlayers ---
export async function toolGetSignalPlayers({
  signal, position, maxCost
}: { signal: string; position?: string; maxCost?: number }) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const currentGW: number = bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1;

    const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    let candidates = allPlayers;
    if (position && positionMap[position.toUpperCase()]) {
      candidates = candidates.filter(p => p.element_type === positionMap[position.toUpperCase()]);
    }
    if (maxCost) candidates = candidates.filter(p => p.now_cost <= maxCost * 10);

    const enriched = candidates.map(p => enrichPlayerServer(p, tfdrMap, teams, fixtures));
    const thresholds = computePositionThresholds(enriched);

    const signalKey = signal.toLowerCase().replace(/[^a-z]/g, "");
    const flagMap: Record<string, keyof ReturnType<typeof getPlayerFlags>> = {
      hiddengem: "isHiddenGem",
      formrun: "isFormRun",
      ftbrun: "isFTBRun",
      pricerise: "isPriceRise",
      dueagoal: "isDueAGoal",
      regressionrisk: "isRegressionRisk",
      bookingrisk: "isBookingRisk"
    };
    const flagName = flagMap[signalKey];
    if (!flagName) {
      return { error: `Unknown signal "${signal}". Valid options: hiddenGem, formRun, ftbRun, priceRise, dueAGoal, regressionRisk, bookingRisk` };
    }

    const matched = enriched
      .filter(p => {
        const flags = getPlayerFlags(p, fixtures, teams, tfdrMap, thresholds, currentGW);
        return flags[flagName];
      })
      .sort((a: any, b: any) => b.valueScore - a.valueScore)
      .map((p: any) => {
        const base: any = {
          name: p.web_name,
          team: teamMap[p.team],
          position: positionLabel[p.element_type],
          price: (p.now_cost / 10).toFixed(1),
          value_score: p.valueScore,
          fpl_form: p.fplForm,
          fdr: p.fdr,
          selected_by: p.selected_by_percent + "%"
        };
        if (signalKey === "dueagoal" || signalKey === "regressionrisk") {
          base.xg_total = parseFloat(p.expected_goals ?? "0");
          base.actual_goals = p.goals_scored ?? 0;
          base.xg_per_90 = p.expected_goals_per_90 ?? 0;
        }
        if (signalKey === "bookingrisk") {
          const yellows = p.yellow_cards ?? 0;
          const reds = p.red_cards ?? 0;
          const mins = p.minutes ?? 0;
          base.yellow_cards = yellows;
          base.red_cards = reds;
          base.cards_per_90 = mins > 0 ? parseFloat((yellows / (mins / 90)).toFixed(2)) : 0;
          base.threshold_note = yellows === 4 ? "One yellow = 1-match ban (pre-GW19 threshold)"
            : yellows === 9 ? "One yellow = 1-match ban (pre-GW32 threshold)"
            : "High booking rate";
        }
        return base;
      });

    return {
      signal,
      count: matched.length,
      players: matched
    };
  } catch (err: any) {
    return { error: `Failed to get signal players: ${err.message}` };
  }
}

// --- New Tool: filterPlayers ---
export async function toolFilterPlayers({
  position, maxCost, minXgPer90, maxUpcomingFdr, teamId, minReliability, archetype, maxOwnership
}: {
  position?: string;
  maxCost?: number;
  minXgPer90?: number;
  maxUpcomingFdr?: number;
  teamId?: number;
  minReliability?: number;
  archetype?: string;
  maxOwnership?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    let candidates = allPlayers.filter(p => playerSummariesCache[p.id]?.history?.length >= 3);
    if (position) {
      const posNum = positionMap[position.toUpperCase()];
      if (posNum) candidates = candidates.filter(p => p.element_type === posNum);
    }
    if (maxCost) candidates = candidates.filter(p => p.now_cost <= maxCost * 10);
    if (teamId) candidates = candidates.filter(p => p.team === teamId);
    if (minXgPer90) {
      candidates = candidates.filter(p => {
        const mins = p.minutes || 1;
        const xgPer90 = (parseFloat(p.expected_goals || "0") / mins) * 90;
        return xgPer90 >= minXgPer90;
      });
    }

    const enriched = candidates.map(p => enrichPlayerServer(p, tfdrMap, teams, fixtures));

    let filtered = enriched.filter(p => p.valueScore > 0);
    if (maxUpcomingFdr) filtered = filtered.filter(p => p.fdr <= maxUpcomingFdr);
    if (minReliability) filtered = filtered.filter(p => (p.perfProfile?.reliability_score ?? 1) >= minReliability);
    if (archetype) {
      const norm = archetype.toLowerCase();
      filtered = filtered.filter(p => p.perfProfile?.archetype?.toLowerCase().includes(norm));
    }
    if (maxOwnership != null) filtered = filtered.filter(p => parseFloat(p.selected_by_percent) <= maxOwnership);

    const top = filtered
      .sort((a: any, b: any) => b.valueScore - a.valueScore)
      .slice(0, 20)
      .map((p: any) => {
        const mins = p.minutes || 1;
        return {
          name: p.web_name,
          team: teamMap[p.team],
          position: positionLabel[p.element_type],
          price: (p.now_cost / 10).toFixed(1),
          value_score: p.valueScore,
          archetype: p.perfProfile?.archetype ?? "Not Enough Data",
          base_pp90: parseFloat((p.perfProfile?.base_pp90 ?? 0).toFixed(2)),
          reliability: parseFloat((p.perfProfile?.reliability_score ?? 0).toFixed(2)),
          avg_upcoming_fdr: p.fdr,
          fpl_form: p.fplForm,
          xg_per_90: parseFloat(((parseFloat(p.expected_goals || "0") / mins) * 90).toFixed(2)),
          xa_per_90: parseFloat(((parseFloat(p.expected_assists || "0") / mins) * 90).toFixed(2)),
          selected_by: p.selected_by_percent + "%",
          total_points: p.total_points,
          status: p.status,
          news: p.news || null
        };
      });

    const filtersApplied: Record<string, any> = {};
    if (position) filtersApplied.position = position;
    if (maxCost) filtersApplied.max_cost = `£${maxCost}m`;
    if (minXgPer90) filtersApplied.min_xg_per_90 = minXgPer90;
    if (maxUpcomingFdr) filtersApplied.max_upcoming_fdr = maxUpcomingFdr;
    if (teamId) filtersApplied.team_id = teamId;
    if (minReliability) filtersApplied.min_reliability = minReliability;
    if (archetype) filtersApplied.archetype = archetype;
    if (maxOwnership != null) filtersApplied.max_ownership = `${maxOwnership}%`;

    return { filters_applied: filtersApplied, count: top.length, players: top };
  } catch (err: any) {
    return { error: `Failed to filter players: ${err.message}` };
  }
}

// --- New Tool: getCaptaincyAnalysis ---
export async function toolGetCaptaincyAnalysis({
  squadPlayerNames, entryId, currentGW
}: {
  squadPlayerNames?: string[];
  entryId?: number;
  currentGW?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    const gw = currentGW ?? (bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1);

    // Resolve candidate players — from explicit names, or entryId picks, or fallback to top captaincy assets
    let candidates: any[] = [];

    if (entryId) {
      try {
        const PORT = process.env.PORT || 3000;
        const picksRes = await fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/event/${gw}/picks`);
        if (picksRes.ok) {
          const picksData = await picksRes.json();
          candidates = picksData.picks
            ?.filter((pick: any) => pick.position <= 11)
            .map((pick: any) => allPlayers.find(p => p.id === pick.element))
            .filter(Boolean) ?? [];
        }
      } catch (_) {}
    }

    if (candidates.length === 0 && squadPlayerNames?.length) {
      candidates = squadPlayerNames.map(name => {
        const norm = name.toLowerCase().trim();
        return allPlayers.find(p =>
          p.web_name.toLowerCase() === norm ||
          `${p.first_name} ${p.second_name}`.toLowerCase().includes(norm)
        );
      }).filter(Boolean);
    }

    // Fall back to top attacking assets by form if no squad provided
    if (candidates.length === 0) {
      candidates = allPlayers
        .filter(p => p.element_type >= 3 && parseFloat(p.form) >= 5)
        .sort((a, b) => parseFloat(b.form) - parseFloat(a.form))
        .slice(0, 10);
    }

    const enriched = candidates
      .filter(p => p.element_type >= 2) // exclude GKPs from captaincy
      .map(p => enrichPlayerServer(p, tfdrMap, teams, fixtures));

    // Get next fixture details for each player
    const withFixtures = enriched.map(p => {
      const nextFix = fixtures
        .filter((f: any) => !f.finished && (f.team_h === p.team || f.team_a === p.team))
        .sort((a: any, b: any) => a.event - b.event)
        .slice(0, 1)[0];

      const isHome = nextFix?.team_h === p.team;
      const oppId = nextFix ? (isHome ? nextFix.team_a : nextFix.team_h) : null;
      const oppTeam = oppId ? teams.find((t: any) => t.id === oppId) : null;
      const ctx = isHome ? 'home' : 'away';
      const attackFdr = oppId ? tfdrMap[oppId]?.[ctx]?.attack_fdr?.toFixed(2) : null;

      return {
        name: p.web_name,
        team: teamMap[p.team],
        position: positionLabel[p.element_type],
        price: (p.now_cost / 10).toFixed(1),
        value_score: p.valueScore,
        base_pp90: parseFloat((p.perfProfile?.base_pp90 ?? 0).toFixed(2)),
        archetype: p.perfProfile?.archetype ?? "Not Enough Data",
        reliability: parseFloat((p.perfProfile?.reliability_score ?? 0).toFixed(2)),
        fpl_form: p.fplForm,
        selected_by: p.selected_by_percent + "%",
        next_fixture: nextFix ? {
          gw: nextFix.event,
          opponent: oppTeam?.short_name ?? "?",
          home: isHome,
          attack_fdr: attackFdr ? parseFloat(attackFdr) : null
        } : null
      };
    });

    // Sort by captaincy score: base_pp90 × (1 / attack_fdr) weighted by reliability
    const ranked = withFixtures
      .sort((a, b) => {
        const aFdr = a.next_fixture?.attack_fdr ?? 3;
        const bFdr = b.next_fixture?.attack_fdr ?? 3;
        const aScore = (a.base_pp90 / aFdr) * a.reliability;
        const bScore = (b.base_pp90 / bFdr) * b.reliability;
        return bScore - aScore;
      });

    const top = ranked[0];
    const verdict = top
      ? `**${top.name}** (${top.team}, ${top.position}) is the strongest captaincy pick — PP90 of ${top.base_pp90} against ${top.next_fixture?.opponent ?? "?"} (attack FDR: ${top.next_fixture?.attack_fdr ?? "?"}) with ${(top.reliability * 100).toFixed(0)}% reliability.`
      : "Insufficient data to make a captaincy recommendation.";

    return {
      gameweek: gw,
      verdict,
      ranked_options: ranked,
      note: "Ranked by: base_pp90 ÷ opponent attack_fdr × reliability. Lower attack_fdr = easier for attackers."
    };
  } catch (err: any) {
    return { error: `Failed to get captaincy analysis: ${err.message}` };
  }
}

// --- New Tool: explainFdr ---
export async function toolExplainFdr({
  teamName, gameweek
}: {
  teamName: string;
  gameweek?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();

    const team = teams.find((t: any) =>
      t.name.toLowerCase().includes(teamName.toLowerCase()) ||
      t.short_name.toLowerCase().includes(teamName.toLowerCase())
    );
    if (!team) return { error: `Team "${teamName}" not found.` };

    const currentGW: number = bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1;
    const targetGW = gameweek ?? currentGW;

    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const teamFixtures = fixtures.filter((f: any) =>
      !f.finished && f.event === targetGW && (f.team_h === team.id || f.team_a === team.id)
    );

    if (teamFixtures.length === 0) {
      return {
        team: team.name,
        gameweek: targetGW,
        note: "No fixture found for this team in this gameweek (blank gameweek or GW already finished)."
      };
    }

    const tfdr = tfdrMap[team.id];
    const standings = calculateLiveStandings(fixtures);
    const st = standings[team.id] ?? { position: 10, rank_attack_home: 10, rank_attack_away: 10, rank_defense_home: 10, rank_defense_away: 10 };

    const fixtureBreakdowns = teamFixtures.map((f: any) => {
      const isHome = f.team_h === team.id;
      const opponentId = isHome ? f.team_a : f.team_h;
      const opponentName = teamMap[opponentId] ?? String(opponentId);
      const ctx = isHome ? 'home' : 'away';
      const opponentTfdr = tfdrMap[opponentId];

      const goalsScored = fixtures.filter((x: any) => x.finished && (x.team_h === opponentId || x.team_a === opponentId)).slice(-5)
        .reduce((s: number, x: any) => s + (x.team_h === opponentId ? x.team_h_score : x.team_a_score), 0);
      const goalsConceded = fixtures.filter((x: any) => x.finished && (x.team_h === opponentId || x.team_a === opponentId)).slice(-5)
        .reduce((s: number, x: any) => s + (x.team_h === opponentId ? x.team_a_score : x.team_h_score), 0);

      const opponentSt = standings[opponentId] ?? { position: 10 };

      return {
        opponent: opponentName,
        venue: isHome ? "Home" : "Away",
        fpl_difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
        tfdr_scores: {
          attack_fdr: tfdr?.[ctx]?.attack_fdr?.toFixed(2) ?? "n/a",
          defense_fdr: tfdr?.[ctx]?.defense_fdr?.toFixed(2) ?? "n/a",
          overall_fdr: tfdr?.[ctx]?.overall?.toFixed(2) ?? "n/a"
        },
        opponent_context: {
          league_position: opponentSt.position,
          team_strength: opponentId,
          goals_scored_last_5: goalsScored,
          goals_conceded_last_5: goalsConceded,
          attack_fdr_as_opponent: opponentTfdr?.[isHome ? 'away' : 'home']?.attack_fdr?.toFixed(2) ?? "n/a",
          defense_fdr_as_opponent: opponentTfdr?.[isHome ? 'away' : 'home']?.defense_fdr?.toFixed(2) ?? "n/a"
        },
        interpretation: {
          for_attackers: `${team.short_name} attackers face ${opponentName}'s defense (attack_fdr ${tfdr?.[ctx]?.attack_fdr?.toFixed(1) ?? "?"} — ${parseFloat(tfdr?.[ctx]?.attack_fdr ?? "3") <= 2.5 ? "easy" : parseFloat(tfdr?.[ctx]?.attack_fdr ?? "3") >= 3.5 ? "tough" : "medium"})`,
          for_defenders: `${team.short_name} defenders face ${opponentName}'s attack (defense_fdr ${tfdr?.[ctx]?.defense_fdr?.toFixed(1) ?? "?"} — ${parseFloat(tfdr?.[ctx]?.defense_fdr ?? "3") <= 2.5 ? "easy CS chance" : parseFloat(tfdr?.[ctx]?.defense_fdr ?? "3") >= 3.5 ? "tough CS chance" : "medium CS chance"})`
        }
      };
    });

    return {
      team: team.name,
      short_name: team.short_name,
      gameweek: targetGW,
      league_position: st.position,
      team_strength_overall: team.strength,
      fixtures: fixtureBreakdowns,
      tfdr_explanation: "TFDR (Team Fixture Difficulty Rating) is computed from: opponent league position + attack/defense form (goals scored/conceded last 5 home/away) + team strength. It's normalized 1–5 across all 20 teams and split by position context (attack vs defense) and venue (home vs away)."
    };
  } catch (err: any) {
    return { error: `Failed to explain FDR: ${err.message}` };
  }
}

// --- New Tool: simulateTransfers ---
export async function toolSimulateTransfers({
  entryId, transfersOut, transfersIn, currentGW, gwHorizon = 5
}: {
  entryId: number;
  transfersOut: string[];
  transfersIn: string[];
  currentGW?: number;
  gwHorizon?: number;
}) {
  try {
    if (transfersOut.length !== transfersIn.length) {
      return { error: "transfersOut and transfersIn must have the same length." };
    }
    if (transfersOut.length === 0) {
      return { error: "Provide at least one transfer (one player out, one player in)." };
    }

    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();

    const gw = currentGW ?? (bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1);

    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    let currentSquad: any[] = [];
    let bankValue = 0;
    let freeTransfers = 1;

    try {
      const PORT = process.env.PORT || 3000;
      const [picksRes, historyRes] = await Promise.all([
        fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/event/${gw}/picks`),
        fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/history`)
      ]);
      if (picksRes.ok) {
        const picksData = await picksRes.json();
        currentSquad = picksData.picks?.map((pick: any) => {
          return allPlayers.find(p => p.id === pick.element) ?? { id: pick.element };
        }) ?? [];
        bankValue = picksData.entry_history?.bank ?? 0;
        const transfersCost = picksData.entry_history?.event_transfers_cost ?? 0;
        freeTransfers = transfersCost === 0 ? 1 : 0;
      }
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        bankValue = historyData.current?.slice(-1)[0]?.bank ?? bankValue;
      }
    } catch (_) {
      // proceed without squad data
    }

    const resolvePlayer = (name: string): any | null => {
      const norm = name.toLowerCase().trim();
      return allPlayers.find(p =>
        p.web_name.toLowerCase() === norm ||
        `${p.first_name} ${p.second_name}`.toLowerCase().includes(norm)
      ) ?? null;
    };

    const pairs: Array<{ out: any; in: any; valid: boolean; error?: string }> = [];

    for (let i = 0; i < transfersOut.length; i++) {
      const outPlayer = resolvePlayer(transfersOut[i]);
      const inPlayer = resolvePlayer(transfersIn[i]);

      if (!outPlayer) { pairs.push({ out: null, in: inPlayer, valid: false, error: `Player "${transfersOut[i]}" not found` }); continue; }
      if (!inPlayer) { pairs.push({ out: outPlayer, in: null, valid: false, error: `Player "${transfersIn[i]}" not found` }); continue; }

      const errors: string[] = [];
      if (outPlayer.element_type !== inPlayer.element_type) {
        errors.push(`Position mismatch: ${positionLabel[outPlayer.element_type]} out, ${positionLabel[inPlayer.element_type]} in`);
      }

      const squadAfterRemoval = currentSquad.filter(p => p.id !== outPlayer.id);
      const playersFromInTeam = squadAfterRemoval.filter(p => p.team === inPlayer.team).length;
      if (playersFromInTeam >= 3) {
        errors.push(`Already have 3 players from ${teamMap[inPlayer.team] ?? inPlayer.team}`);
      }

      const totalBudget = (outPlayer.now_cost ?? 0) + bankValue;
      if (inPlayer.now_cost > totalBudget) {
        errors.push(`Budget: need £${(inPlayer.now_cost / 10).toFixed(1)}m, have £${(totalBudget / 10).toFixed(1)}m (selling price + bank)`);
      }

      pairs.push({ out: outPlayer, in: inPlayer, valid: errors.length === 0, error: errors.join("; ") || undefined });
    }

    const clampedHorizon = Math.max(1, Math.min(6, gwHorizon));
    const validPairs = pairs.filter(p => p.valid);
    const enrichedOuts = validPairs.map(p => enrichPlayerServer(p.out, tfdrMap, teams, fixtures, clampedHorizon));
    const enrichedIns = validPairs.map(p => enrichPlayerServer(p.in, tfdrMap, teams, fixtures, clampedHorizon));

    // Scale verdict thresholds proportionally to the GW horizon
    const horizonScale = clampedHorizon / 5;

    const transferResults = pairs.map((pair, i) => {
      if (!pair.valid || !pair.out || !pair.in) {
        return {
          out: pair.out ? { name: pair.out.web_name, position: positionLabel[pair.out.element_type], price: (pair.out.now_cost / 10).toFixed(1) } : { name: transfersOut[i] },
          in: pair.in ? { name: pair.in.web_name, position: positionLabel[pair.in.element_type], price: (pair.in.now_cost / 10).toFixed(1) } : { name: transfersIn[i] },
          valid: false,
          error: pair.error
        };
      }

      const validIdx = validPairs.indexOf(pair);
      const eOut = enrichedOuts[validIdx];
      const eIn = enrichedIns[validIdx];

      const netGW = parseFloat((eIn.valueScore - eOut.valueScore).toFixed(2));
      const verdict = netGW >= 3 * horizonScale ? "Strong upgrade" : netGW >= 1 * horizonScale ? "Marginal upgrade" : netGW >= -1 * horizonScale ? "Neutral / coin flip" : "Downgrade — reconsider";
      const net5GW = netGW;

      return {
        out: {
          name: eOut.web_name, team: teamMap[eOut.team], position: positionLabel[eOut.element_type],
          price: (eOut.now_cost / 10).toFixed(1), value_score: eOut.valueScore,
          archetype: eOut.perfProfile?.archetype ?? "n/a", avg_fdr: eOut.fdr
        },
        in: {
          name: eIn.web_name, team: teamMap[eIn.team], position: positionLabel[eIn.element_type],
          price: (eIn.now_cost / 10).toFixed(1), value_score: eIn.valueScore,
          archetype: eIn.perfProfile?.archetype ?? "n/a", avg_fdr: eIn.fdr
        },
        valid: true,
        net_value_gain: net5GW,
        verdict,
        price_delta: parseFloat(((eIn.now_cost - eOut.now_cost) / 10).toFixed(1))
      };
    });

    const numHits = Math.max(0, validPairs.length - freeTransfers);
    const hitCost = numHits * 4;
    const totalNetGain = parseFloat((
      transferResults.filter(r => r.valid && 'net_value_gain' in r).reduce((s: number, r: any) => s + r.net_value_gain, 0) - hitCost
    ).toFixed(2));
    const hitRecoveryVerdict = hitCost === 0 ? "N/A (Free)" : totalNetGain > 2 ? "High — Expected to recover hit within 2-3 GWs" : totalNetGain > 0 ? "Marginal — Slow recovery" : "Poor — Hit likely to hurt rank";

    const totalSpend = transferResults.filter(r => r.valid).reduce((s, r: any) => s + (r.price_delta * 10), 0);
    const bankRemaining = parseFloat(((bankValue - totalSpend) / 10).toFixed(1));

    return {
      entryId,
      gw_horizon: clampedHorizon,
      free_transfers_available: freeTransfers,
      hit_cost: hitCost,
      total_net_value_gain: totalNetGain,
      hit_recovery_likelihood: hitRecoveryVerdict,
      transfers: transferResults,
      bank_remaining: bankRemaining,
      summary: hitCost > 0 
        ? `This move costs ${hitCost} points in hits. Your projected net advantage over ${clampedHorizon} weeks is ${totalNetGain} points.`
        : `This is a free transfer sequence with a projected advantage of ${totalNetGain} points over ${clampedHorizon} weeks.`
    };
  } catch (err: any) {
    return { error: `Failed to simulate transfers: ${err.message}` };
  }
}

// --- New Tool: summarizeH2H ---
export async function toolSummarizeH2H({
  myEntryId, opponentEntryId, currentGW
}: {
  myEntryId: number;
  opponentEntryId: number;
  currentGW?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();

    const gw = currentGW ?? (bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1);

    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    const PORT = process.env.PORT || 3000;

    const fetchTeamPicks = async (entryId: number) => {
      const [entryRes, picksRes] = await Promise.all([
        fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}`),
        fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/event/${gw}/picks`)
      ]);
      if (!entryRes.ok || !picksRes.ok) throw new Error(`Could not fetch data for team ${entryId}`);
      const entryData = await entryRes.json();
      const picksData = await picksRes.json();
      return { entryData, picks: picksData.picks, chip: picksData.active_chip };
    };

    const [myTeam, oppTeam] = await Promise.all([
      fetchTeamPicks(myEntryId),
      fetchTeamPicks(opponentEntryId)
    ]);

    const enrichPicks = (picks: any[]) => picks.map(pick => {
      const player = allPlayers.find(p => p.id === pick.element);
      if (!player) return { id: pick.element, name: `Player ${pick.element}`, position: "?", price: 0, valueScore: 0, isCaptain: pick.is_captain, isViceCaptain: pick.is_vice_captain, multiplier: pick.multiplier };
      const enriched = enrichPlayerServer(player, tfdrMap, teams, fixtures);
      return {
        ...enriched,
        name: player.web_name,
        team: teamMap[player.team],
        position: positionLabel[player.element_type],
        price: (player.now_cost / 10).toFixed(1),
        isCaptain: pick.is_captain,
        isViceCaptain: pick.is_vice_captain,
        multiplier: pick.multiplier,
        pickPosition: pick.position
      };
    });

    const myPicks = enrichPicks(myTeam.picks);
    const oppPicks = enrichPicks(oppTeam.picks);

    const myIds = new Set(myPicks.map(p => p.id));
    const oppIds = new Set(oppPicks.map(p => p.id));

    const differential_mine = myPicks.filter(p => !oppIds.has(p.id)).sort((a, b) => b.valueScore - a.valueScore);
    const differential_opp = oppPicks.filter(p => !myIds.has(p.id)).sort((a, b) => b.valueScore - a.valueScore);
    const shared = myPicks.filter(p => oppIds.has(p.id)).sort((a, b) => b.valueScore - a.valueScore);

    const myCaptain = myPicks.find(p => p.isCaptain);
    const oppCaptain = oppPicks.find(p => p.isCaptain);

    const formatPlayer = (p: any) => ({
      name: p.name,
      team: p.team,
      position: p.position,
      price: p.price,
      value_score: p.valueScore,
      archetype: p.perfProfile?.archetype ?? "n/a",
      avg_fdr: p.fdr,
      fpl_form: p.fplForm
    });

    const eoSummary = {
      total_my_players: myPicks.length,
      total_opp_players: oppPicks.length,
      shared_count: shared.length,
      my_differentials: differential_mine.length,
      opp_differentials: differential_opp.length
    };

    const myTotalValue = myPicks.reduce((s, p) => s + (p.valueScore || 0), 0);
    const oppTotalValue = oppPicks.reduce((s, p) => s + (p.valueScore || 0), 0);

    // Phase 8: Rival Block Logic
    const dangerousOppDifferentials = differential_opp.filter(p => p.valueScore > 4 || p.isCaptain);
    const blockingSuggestions: string[] = [];
    
    if (dangerousOppDifferentials.length > 0) {
      const topThreat = dangerousOppDifferentials[0];
      if (topThreat.isCaptain) {
        blockingSuggestions.push(`VULNERABILITY: Your opponent has captained ${topThreat.name}. Consider acquiring him to neutralize this threat.`);
      } else if (topThreat.valueScore > 5.5) {
        blockingSuggestions.push(`DEFENSIVE MOVE: ${topThreat.name} is a strong differential for your rival. Matching ownership would lock in your current lead.`);
      }
    }

    return {
      gameweek: gw,
      my_team: {
        name: myTeam.entryData.name,
        manager: `${myTeam.entryData.player_first_name} ${myTeam.entryData.player_last_name}`,
        chip: myTeam.chip ?? null,
        total_value_score: parseFloat(myTotalValue.toFixed(2))
      },
      opponent_team: {
        name: oppTeam.entryData.name,
        manager: `${oppTeam.entryData.player_first_name} ${oppTeam.entryData.player_last_name}`,
        chip: oppTeam.chip ?? null,
        total_value_score: parseFloat(oppTotalValue.toFixed(2))
      },
      value_edge: parseFloat((myTotalValue - oppTotalValue).toFixed(2)),
      captaincy: {
        mine: myCaptain ? formatPlayer(myCaptain) : null,
        opponent: oppCaptain ? formatPlayer(oppCaptain) : null,
        same_captain: myCaptain?.id === oppCaptain?.id
      },
      shared_players: shared.map(formatPlayer),
      my_differentials: differential_mine.map(formatPlayer),
      opponent_differentials: differential_opp.map(formatPlayer),
      eo_summary: eoSummary,
      recommendation: myTotalValue > oppTotalValue
        ? `You have the stronger squad by value (${(myTotalValue - oppTotalValue).toFixed(1)} pts). Focus on your differential edge.`
        : myTotalValue < oppTotalValue
        ? `Opponent has a stronger squad by value. Watch their key differentials: ${differential_opp.slice(0, 2).map(p => p.name).join(", ")}.`
        : "Squads are evenly matched. Captaincy call is key.",
      blocking_strategy: dangerousOppDifferentials.length > 0 ? {
        top_threat: formatPlayer(dangerousOppDifferentials[0]),
        suggestions: blockingSuggestions
      } : null
    };
  } catch (err: any) {
    return { error: `Failed to summarize H2H: ${err.message}` };
  }
}

// --- New Tool: getBookingRisks ---
export async function toolGetBookingRisks() {
  try {
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teams: any[] = bootstrapData.teams;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const currentGW: number = bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1;

    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    const banImminent: any[] = [];
    const highRate: any[] = [];

    for (const p of allPlayers) {
      const yellows = p.yellow_cards ?? 0;
      const reds = p.red_cards ?? 0;
      const mins = p.minutes ?? 0;
      const cardsPer90 = mins > 0 ? yellows / (mins / 90) : 0;

      const isThresholdBan =
        (yellows === 4 && currentGW < 19) ||
        (yellows === 9 && currentGW < 32) ||
        (yellows >= 5 && reds >= 2);

      const entry = {
        name: p.web_name,
        team: teamMap[p.team],
        position: positionLabel[p.element_type],
        price: (p.now_cost / 10).toFixed(1),
        yellow_cards: yellows,
        red_cards: reds,
        minutes: mins,
        cards_per_90: parseFloat(cardsPer90.toFixed(2)),
        threshold_note: yellows === 4 && currentGW < 19
          ? `${4 - yellows + 1} more yellow = ban before GW19 threshold`
          : yellows === 9 && currentGW < 32
          ? `${9 - yellows + 1} more yellow = ban before GW32 threshold`
          : yellows >= 5 && reds >= 2
          ? "Multiple card accumulation — check availability"
          : "High booking rate (0.3+ per 90)"
      };

      if (isThresholdBan) {
        banImminent.push(entry);
      } else if (mins >= 270 && cardsPer90 >= 0.3) {
        highRate.push(entry);
      }
    }

    banImminent.sort((a, b) => b.yellow_cards - a.yellow_cards);
    highRate.sort((a, b) => b.cards_per_90 - a.cards_per_90);

    return {
      current_gw: currentGW,
      ban_imminent: banImminent,
      high_booking_rate: highRate,
      note: "ban_imminent = players at a yellow card threshold; high_booking_rate = 0.3+ cards per 90 with 270+ mins played"
    };
  } catch (err: any) {
    return { error: `Failed to get booking risks: ${err.message}` };
  }
}

// --- New Tool: getDifferentials ---
export async function toolGetDifferentials({
  position, maxCost, maxOwnership = 10, limit = 10
}: {
  position?: string;
  maxCost?: number;
  maxOwnership?: number;
  limit?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const positionMap: Record<string, number> = { GKP: 1, DEF: 2, MID: 3, FWD: 4 };
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    let candidates = allPlayers.filter(p => playerSummariesCache[p.id]?.history?.length >= 3);
    if (position && positionMap[position.toUpperCase()]) {
      candidates = candidates.filter(p => p.element_type === positionMap[position.toUpperCase()]);
    }
    if (maxCost) candidates = candidates.filter(p => p.now_cost <= maxCost * 10);
    
    // Core filter: Max ownership for differentials
    candidates = candidates.filter(p => parseFloat(p.selected_by_percent) <= maxOwnership);

    const enriched = candidates.map(p => enrichPlayerServer(p, tfdrMap, teams, fixtures));

    const top = enriched
      .filter(p => p.valueScore > 0)
      .sort((a: any, b: any) => b.valueScore - a.valueScore)
      .slice(0, limit)
      .map((p: any) => ({
        name: p.web_name,
        team: teamMap[p.team],
        position: positionLabel[p.element_type],
        price: (p.now_cost / 10).toFixed(1),
        value_score: p.valueScore,
        selected_by: p.selected_by_percent + "%",
        avg_upcoming_fdr: p.fdr,
        archetype: p.perfProfile?.archetype ?? "Differential",
        fpl_form: p.fplForm
      }));

    return {
      ownership_threshold: `${maxOwnership}%`,
      count: top.length,
      players: top,
      note: "Differentials are players with low ownership but high value scores based on upcoming fixtures and performance profiles."
    };
  } catch (err: any) {
    return { error: `Failed to get differentials: ${err.message}` };
  }
}

// --- New Tool: optimizeLineup ---
export async function toolOptimizeLineup({
  entryId, currentGW
}: {
  entryId: number;
  currentGW?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    
    const gw = currentGW ?? (bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1);
    
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    bootstrapData.teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });
    const positionLabel = ["", "GKP", "DEF", "MID", "FWD"];

    const PORT = process.env.PORT || 3000;
    const picksRes = await fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/event/${gw}/picks`);
    if (!picksRes.ok) throw new Error(`Could not fetch squad for entry ${entryId} GW ${gw}`);
    
    const picksData = await picksRes.json();
    const squad: any[] = picksData.picks? (picksData.picks.map((pick: any) => {
      const p = allPlayers.find(pl => pl.id === pick.element);
      return enrichPlayerServer(p, tfdrMap, teams, fixtures, 1);
    })) : [];

    if (squad.length === 0) throw new Error("Squad appears to be empty.");

    // Evaluation for the immediate next GW
    const evalSquad = squad.map(p => {
      const nextFix = getNextFixtures(p.team, fixtures, teams, tfdrMap, 1, 0, p.element_type)[0];
      let xPts = 0;
      if (nextFix && !nextFix.isBlank) {
        const perf = p.perfProfile;
        const fallback = perf?.base_pp90 ?? (parseFloat(p.form) || p.now_cost / 20);
        const pp90At = (d: number) => {
          const k = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
          return ({ 2: perf?.pp90_fdr2, 3: perf?.pp90_fdr3, 4: perf?.pp90_fdr4, 5: perf?.pp90_fdr5 }[k] ?? fallback);
        };
        xPts = nextFix.isDouble ? pp90At(nextFix.difficulty) * 2 : pp90At(nextFix.difficulty);
      }
      return { 
        ...p, 
        xPts, 
        opponent: nextFix?.opponent ?? "BLANK", 
        fdr: nextFix?.difficulty ?? 5,
        isDouble: nextFix?.isDouble ?? false 
      };
    });

    const gks = evalSquad.filter(p => p.element_type === 1).sort((a,b) => b.xPts - a.xPts);
    const defs = evalSquad.filter(p => p.element_type === 2).sort((a,b) => b.xPts - a.xPts);
    const mids = evalSquad.filter(p => p.element_type === 3).sort((a,b) => b.xPts - a.xPts);
    const fwds = evalSquad.filter(p => p.element_type === 4).sort((a,b) => b.xPts - a.xPts);

    const starters: any[] = [];
    const bench: any[] = [];

    // 1. Mandatory 1 GK
    starters.push(gks[0]);
    bench.push(gks[1]);

    // 2. Mandatory 3 DEFs, 1 FWD
    starters.push(...defs.slice(0, 3));
    const remainingDefs = defs.slice(3);
    
    starters.push(fwds[0]);
    const remainingFwds = fwds.slice(1);

    // 3. Fill up to 11 using best remaining outfielders (max 5 DEF, 5 MID, 3 FWD)
    const outfielders = [...mids, ...remainingDefs, ...remainingFwds].sort((a,b) => b.xPts - a.xPts);
    
    const posCounts = { 1: 1, 2: 3, 3: 0, 4: 1 };
    
    for (const p of outfielders) {
      const pType = p.element_type as 1|2|3|4;
      const canAdd = (pType === 2 && posCounts[2] < 5) || 
                     (pType === 3 && posCounts[3] < 5) || 
                     (pType === 4 && posCounts[4] < 3);
      
      if (starters.length < 11 && canAdd) {
        starters.push(p);
        posCounts[pType]++;
      } else {
        bench.push(p);
      }
    }

    // Sort bench by xPts (excluding GK who always goes first or last depending on logic, but FPL bench order matters)
    const outfieldBench = bench.filter(p => p.element_type !== 1).sort((a,b) => b.xPts - a.xPts);
    const finalBench = [bench.find(p => p.element_type === 1), ...outfieldBench];

    const sortedStarters = starters.sort((a,b) => a.element_type - b.element_type);
    const topTwo = [...starters].sort((a,b) => b.xPts - a.xPts);

    const format = (p: any) => ({
      id: p.id,
      name: p.web_name,
      team: teamMap[p.team],
      pos: positionLabel[p.element_type],
      xPts: parseFloat(p.xPts.toFixed(2)),
      opponent: p.opponent,
      fdr: p.fdr,
      is_double: p.isDouble
    });

    return {
      gameweek: gw,
      formation: `${posCounts[2]}-${posCounts[3]}-${posCounts[4]}`,
      starters: sortedStarters.map(format),
      bench: finalBench.filter(Boolean).map(format),
      captain: format(topTwo[0]),
      vice_captain: format(topTwo[1]),
      recommendation: `Optimal XI for GW${gw} found. Recommended formation is ${posCounts[2]}-${posCounts[3]}-${posCounts[4]} with ${topTwo[0].web_name} as captain.`
    };
  } catch (err: any) {
    return { error: `Failed to optimize lineup: ${err.message}` };
  }
}

// --- New Tool: analyzeChipStrategy ---
export async function toolAnalyzeChipStrategy({
  entryId, currentGW
}: {
  entryId: number;
  currentGW?: number;
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    if (!bootstrapRes.ok) throw new Error("Failed to fetch bootstrap");
    const bootstrapData = await bootstrapRes.json();
    
    const gw = currentGW ?? (bootstrapData.events?.find((e: any) => e.is_current)?.id
      || bootstrapData.events?.find((e: any) => e.is_next)?.id || 1);
    
    const allPlayers: any[] = bootstrapData.elements;
    const teamMap: Record<number, string> = {};
    bootstrapData.teams.forEach((t: any) => { teamMap[t.id] = t.short_name; });

    const PORT = process.env.PORT || 3000;
    const [picksRes, historyRes] = await Promise.all([
      fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/event/${gw}/picks`),
      fetch(`http://localhost:${PORT}/api/fpl/entry/${entryId}/history`)
    ]);

    if (!picksRes.ok || !historyRes.ok) throw new Error(`Could not fetch data for entry ${entryId}`);
    
    const picksData = await picksRes.json();
    const historyData = await historyRes.json();
    const squad: any[] = picksData.picks? (picksData.picks.map((pick: any) => {
      return allPlayers.find(pl => pl.id === pick.element);
    })) : [];

    const chipDefs = bootstrapData.chips || [
      { name: "bboost", start_event: 1, stop_event: 38 },
      { name: "3xc", start_event: 1, stop_event: 38 },
      { name: "freehit", start_event: 1, stop_event: 38 },
      { name: "wildcard", start_event: 1, stop_event: 38 }
    ];

    const playedChips = historyData.chips?.map((c: any) => c.name) ?? [];
    const availableChips = chipDefs.filter((c: any) => !playedChips.includes(c.name));

    // Look ahead 6 GWs
    const horizon = 6;
    const anomalyGWs: any[] = [];
    for (let i = 1; i <= horizon; i++) {
        const targetGW = gw + i;
        if (targetGW > 38) break;

        const teamsInGW = new Set<number>();
        const doubles: number[] = [];
        const blanks: number[] = [];
        
        const gwFixtures = fixtures.filter(f => f.event === targetGW);
        const teamsWithFixtures = new Map<number, number>();
        gwFixtures.forEach(f => {
            teamsWithFixtures.set(f.team_h, (teamsWithFixtures.get(f.team_h) || 0) + 1);
            teamsWithFixtures.set(f.team_a, (teamsWithFixtures.get(f.team_a) || 0) + 1);
        });

        bootstrapData.teams.forEach((t: any) => {
            const count = teamsWithFixtures.get(t.id) || 0;
            if (count === 0) blanks.push(t.id);
            if (count > 1) doubles.push(t.id);
        });

        if (doubles.length > 0 || blanks.length > 0) {
            anomalyGWs.push({
                gw: targetGW,
                doubles: doubles.map(id => teamMap[id]),
                blanks: blanks.map(id => teamMap[id]),
                status: doubles.length > 2 ? "MAJOR DOUBLE" : blanks.length > 2 ? "MAJOR BLANK" : "MINOR ANOMALY"
            });
        }
    }

    const squadImpact = anomalyGWs.map(anom => {
        const blanking = squad.filter(p => anom.blanks.includes(teamMap[p.team])).length;
        const doubling = squad.filter(p => anom.doubles.includes(teamMap[p.team])).length;
        return { gw: anom.gw, squad_blanking: blanking, squad_doubling: doubling, severity: anom.status };
    });

    // Strategy Logic
    const strategies: string[] = [];
    const majorBlank = squadImpact.find(s => s.squad_blanking >= 4);
    if (majorBlank && availableChips.some(c => c.name === "freehit")) {
        strategies.push(`Play Free Hit in GW${majorBlank.gw} to navigate the major blank (you currently have ${majorBlank.squad_blanking} blanking players).`);
    }

    const majorDouble = squadImpact.find(s => s.squad_doubling >= 3);
    if (majorDouble) {
        if (availableChips.some(c => c.name === "bboost")) {
            strategies.push(`Consider Bench Boost in GW${majorDouble.gw} to maximize returns from doubling teams.`);
        }
        if (availableChips.some(c => c.name === "3xc")) {
            strategies.push(`Triple Captain a premium asset from ${anomalyGWs.find(a => a.gw === majorDouble.gw).doubles.join("/")} in GW${majorDouble.gw}.`);
        }
    }

    if (availableChips.some(c => c.name === "wildcard") && squadImpact.some(s => s.severity === "MAJOR DOUBLE" && s.squad_doubling < 2)) {
        const dgw = squadImpact.find(s => s.severity === "MAJOR DOUBLE");
        strategies.push(`Use Wildcard 1-2 weeks before GW${dgw!.gw} to stack your team with doubling assets.`);
    }

    if (strategies.length === 0) {
        strategies.push("No major chip opportunities detected in the next 6 GWs. Continue using free transfers to build toward future doubles.");
    }

    return {
      current_gw: gw,
      available_chips: availableChips.map((c: any) => c.name),
      squad_impact: squadImpact,
      upcoming_anomalies: anomalyGWs,
      recommended_strategies: strategies
    };
  } catch (err: any) {
    return { error: `Failed to analyze chip strategy: ${err.message}` };
  }
}

// --- New Tool: evaluateRotationRisk ---
export async function toolEvaluateRotationRisk({
  playerNames
}: {
  playerNames: string[];
}) {
  try {
    const { map: tfdrMap, teams, fixtures } = await buildTfdrMap();
    const bootstrapRes = await fetch("https://fantasy.premierleague.com/api/bootstrap-static/", { headers: FPL_HEADERS });
    const bootstrapData = await bootstrapRes.json();
    const allPlayers: any[] = bootstrapData.elements;

    const results = playerNames.map(name => {
      const fuzzy = fuzzyFindPlayer(name, allPlayers);
      if (!fuzzy.player) return { name, error: "Player not found" };
      
      const enriched = enrichPlayerServer(fuzzy.player, tfdrMap, teams, fixtures, 1);
      const risk = enriched.rotation_risk;
      const fatigue = enriched.fatigue_risk;
      
      let verdict = "Low - Reliable starter";
      if (risk > 0.4) verdict = "High - Significant rotation history";
      else if (risk > 0.2) verdict = "Moderate - Occasional rotation";
      
      if (fatigue) verdict += " + High Fatigue Risk (Midweek involvement)";

      return {
        id: enriched.id,
        name: enriched.web_name,
        team: teams.find(t => t.id === enriched.team)?.name,
        rotation_risk_score: risk,
        midweek_fatigue_risk: fatigue,
        verdict,
        recommendation: fatigue ? "Consider benching if you have a reliable sub" : risk > 0.3 ? "Check predicted lineups and team news before starting" : "Safe to start"
      };
    });

    return {
      note: "Rotation risk is calculated based on historical 'starts vs appearances' and known team rotation profiles (e.g. Manchester City).",
      results
    };
  } catch (err: any) {
    return { error: `Failed to evaluate rotation risk: ${err.message}` };
  }
}
