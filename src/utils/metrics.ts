import { Fixture, Player, InjuryRecord } from "../types";

export interface PerformanceStats {
  pp90_fdr2: number | null;
  pp90_fdr3: number | null;
  pp90_fdr4: number | null;
  pp90_fdr5: number | null;
  base_pp90: number;
  total_minutes: number;
  appearances: number;
  reliability_score: number;
  fit_reliability_score: number;  // reliability excluding pattern-detected absences
  efficiency_rating: number;
  cameo_pp_per_app: number;
  archetype: "Talisman" | "Flat Track Bully" | "Workhorse" | "Rotation Risk" | "Squad Player" | "Not Enough Data";
  archetype_blurb: string;
}

/**
 * Detects "External Absences" (Injuries/Suspensions) vs "Tactical Drops".
 */
export function detectExcusedMatches(history: any[], player_status?: string): Set<number> {
  const excused_matches = new Set<number>();
  if (!history || history.length === 0) return excused_matches;

  // 1. Group non-starts (0 mins ONLY) into "Absence Gaps"
  let currentGap: number[] = [];
  const gaps: number[][] = [];

  history.forEach((match, idx) => {
    if (match.minutes === 0) {
      currentGap.push(idx);
    } else {
      if (currentGap.length > 0) {
        gaps.push(currentGap);
        currentGap = [];
      }
    }
  });
  if (currentGap.length > 0) gaps.push(currentGap);

  // Helper to check if player was a regular starter (4 starts in a 5-match window)
  const hasRegularSpell = (games: any[]) => {
    if (games.length < 4) return false;
    if (games.length < 5) return games.filter(m => m.minutes >= 60).length === games.length;
    for (let i = 0; i <= games.length - 5; i++) {
      if (games.slice(i, i + 5).filter(m => m.minutes >= 60).length >= 4) return true;
    }
    return false;
  };

  // 2. Evaluate each Gap
  gaps.forEach(gapIndices => {
    const firstIdx = gapIndices[0];
    const lastIdx = gapIndices[gapIndices.length - 1];

    const gamesBefore = history.slice(0, firstIdx).filter(m => m.minutes > 0);
    const wasRegularBefore = hasRegularSpell(gamesBefore.slice(-8));

    const gamesAfter = history.slice(lastIdx + 1).filter(m => m.minutes > 0);
    const isRegularAfter = hasRegularSpell(gamesAfter.slice(0, 8));

    if (wasRegularBefore || isRegularAfter || (wasRegularBefore && lastIdx === history.length - 1 && ['i','s','d'].includes(player_status || ''))) {
      gapIndices.forEach(idx => excused_matches.add(idx));

      // Excuse Ramp-Up / Injury recovery games
      // If the gap is significant (missed 2+ games or was the very start of the season), 
      // excuse up to 3 sub appearances immediately following the gap as they regain match fitness.
      if (gapIndices.length >= 2 || firstIdx === 0) {
        let rampUpCount = 0;
        for (let i = lastIdx + 1; i < history.length && rampUpCount < 3; i++) {
          if (history[i].minutes === 0) break; // hit another gap, abort ramp up
          if (history[i].minutes >= 60) break; // fully fit, ramp up complete
          excused_matches.add(i);
          rampUpCount++;
        }
      }
    }
  });

  return excused_matches;
}

export function calculateXPP90(
  xGPer90: number,
  xAPer90: number,
  xGCPer90: number,
  playerType: number
): number {
  const pCS = Math.exp(-xGCPer90);
  if (playerType === 4) {
    return (xGPer90 * 4) + (xAPer90 * 3) + 2;
  } else if (playerType === 3) {
    return (xGPer90 * 5) + (xAPer90 * 3) + (pCS * 1) + 2;
  } else {
    const csPoints = playerType === 1 ? 6 : 4;
    return (xGPer90 * 6) + (xAPer90 * 3) + (pCS * csPoints) + 2;
  }
}

export function calculatePerformanceProfile(
  history: any[],
  fixtures: Fixture[],
  tfdrMap?: Record<number, any>,
  player_status?: string,
  minApps = 3,
  minMinutes = 270,
  playerType?: number,
  player?: Player,
  injuryPeriods?: InjuryRecord[]
): PerformanceStats {
  // Guard: if history is not a valid array
  if (!Array.isArray(history) || history.length === 0) {
    return {
      pp90_fdr2: null, pp90_fdr3: null, pp90_fdr4: null, pp90_fdr5: null,
      base_pp90: 0, total_minutes: 0, appearances: 0,
      reliability_score: 0, fit_reliability_score: 0,
      efficiency_rating: 0, cameo_pp_per_app: 0,
      archetype: "Not Enough Data",
      archetype_blurb: "Player hasn't played enough minutes to form a reliable performance profile.",
    };
  }

  let total_pts = 0;
  let total_mins = 0;
  let appearances = 0;
  let starts = 0;
  let starts_pts = 0;
  let starts_mins = 0;
  let cameo_count = 0;
  let cameo_pts = 0;
  const total_matches = history.length;

  let fdrBuckets: Record<number, { pts: number; mins: number }> = {
    2: { pts: 0, mins: 0 },
    3: { pts: 0, mins: 0 },
    4: { pts: 0, mins: 0 },
    5: { pts: 0, mins: 0 },
  };

  // 1. Determine excused matches: pattern detection + persisted injury periods
  const excused_matches = detectExcusedMatches(history, player_status);

  // If persisted injury periods are available, convert GW ranges → history indices
  // and union with pattern-detected excused matches.
  if (injuryPeriods && injuryPeriods.length > 0) {
    // Build a map: fixture_id → history index (for fast GW→index lookup)
    const fixtureToIdx: Record<number, number> = {};
    history.forEach((match, idx) => { fixtureToIdx[match.fixture] = idx; });

    // Build a map: GW → history indices (a GW may contain 0 or 1 history entries)
    const gwToIdx: Record<number, number> = {};
    history.forEach((match, idx) => {
      const gw = fixtures.find(f => f.id === match.fixture)?.event;
      if (gw) gwToIdx[gw] = idx;
    });

    for (const period of injuryPeriods) {
      const startGW = period.start_event;
      const endGW = period.end_event;

      // Excuse all 0-minute history entries within the injury GW range
      for (let gw = startGW; endGW !== null && gw <= endGW; gw++) {
        const idx = gwToIdx[gw];
        if (idx !== undefined && history[idx].minutes === 0) {
          excused_matches.add(idx);
        }
      }

      // Grace period: excuse up to 3 sub appearances (< 60 min) immediately after return
      if (endGW !== null) {
        const returnIdx = gwToIdx[endGW];
        if (returnIdx !== undefined) {
          let graceCount = 0;
          for (let i = returnIdx; i < history.length && graceCount < 3; i++) {
            if (history[i].minutes === 0) break; // hit a new absence, stop
            if (history[i].minutes >= 60) break; // fully fit, grace done
            excused_matches.add(i);
            graceCount++;
          }
        }
      }
    }
  }

  for (let i = 0; i < history.length; i++) {
    const match = history[i];
    if (match.minutes === 0) continue;

    appearances++;
    total_pts += match.total_points;
    total_mins += match.minutes;

    const isStart = match.minutes >= 60;

    if (isStart) {
      starts++;
      starts_pts += match.total_points;
      starts_mins += match.minutes;
    } else {
      cameo_count++;
      cameo_pts += match.total_points;
    }

    const fixture = fixtures.find((f) => f.id === match.fixture);
    let fdr = 3;

    if (fixture) {
      if (tfdrMap) {
        const oppTeam = match.was_home ? fixture.team_a : fixture.team_h;
        const oppContext = match.was_home ? 'away' : 'home';

        if (playerType !== undefined && tfdrMap[oppTeam]?.[oppContext]) {
          fdr = tfdrMap[oppTeam][oppContext][playerType <= 2 ? 'defense_fdr' : 'attack_fdr'];
        } else {
          fdr = tfdrMap[oppTeam]?.[oppContext]?.overall || (match.was_home ? fixture.team_h_difficulty : fixture.team_a_difficulty);
        }
      } else {
        fdr = match.was_home ? fixture.team_h_difficulty : fixture.team_a_difficulty;
      }
    }

    // Keep granular FDR for bucketing by using rounded value for the key only
    const fdrBucketKey = Math.round(Math.max(2, Math.min(5, fdr)));
    
    if (isStart) {
      fdrBuckets[fdrBucketKey].pts += match.total_points;
      fdrBuckets[fdrBucketKey].mins += match.minutes;
    }
  }

  // Final Reliability: divides starts by (total_matches minus excused matches)
  // We subtract excused matches because their "0" or "Low" minutes were not tactical.
  const adjusted_total_matches = Math.max(1, total_matches - excused_matches.size);
  const reliability_score = total_matches > 0 ? starts / adjusted_total_matches : 0;
  // fit_reliability_score: reliability computed after excusing pattern-detected injury/suspension gaps.
  // Since reliability_score already incorporates adjusted_total_matches (which excludes excused matches),
  // these are currently equivalent. The field is kept distinct for semantic clarity.
  const fit_reliability_score = reliability_score;
  const efficiency_rating = starts_mins > 0 ? (starts_pts / starts_mins) * 90 : 0;
  const cameo_pp_per_app = cameo_count > 0 ? cameo_pts / cameo_count : 0;
  const raw_base_pp90 = total_mins > 0 ? parseFloat(((total_pts / total_mins) * 90).toFixed(2)) : 0;

  // Blend xPP90 into base_pp90 to reduce outcome bias (lucky finishers deflated, underliers lifted)
  let base_pp90 = raw_base_pp90;
  let fdrScaleRatio = 1;
  if (player && playerType !== undefined && raw_base_pp90 > 0) {
    const xGPer90 = parseFloat(String(player.expected_goals_per_90 ?? "0")) || 0;
    const xAPer90 = parseFloat(String(player.expected_assists_per_90 ?? "0")) || 0;
    const xGCPer90 = parseFloat(String(player.expected_goals_conceded_per_90 ?? "1.2")) || 1.2;
    const xpp90 = calculateXPP90(xGPer90, xAPer90, xGCPer90, playerType);
    base_pp90 = parseFloat((0.7 * xpp90 + 0.3 * raw_base_pp90).toFixed(2));
    fdrScaleRatio = base_pp90 / raw_base_pp90;
  }

  const getPP90 = (fdr: number) =>
    fdrBuckets[fdr].mins > 0 ? parseFloat(((fdrBuckets[fdr].pts / fdrBuckets[fdr].mins) * 90).toFixed(2)) : null;

  const pp90_fdr2 = getPP90(2) !== null ? parseFloat((getPP90(2)! * fdrScaleRatio).toFixed(2)) : null;
  const pp90_fdr3 = getPP90(3) !== null ? parseFloat((getPP90(3)! * fdrScaleRatio).toFixed(2)) : null;
  const pp90_fdr4 = getPP90(4) !== null ? parseFloat((getPP90(4)! * fdrScaleRatio).toFixed(2)) : null;
  const pp90_fdr5 = getPP90(5) !== null ? parseFloat((getPP90(5)! * fdrScaleRatio).toFixed(2)) : null;

  let archetype: PerformanceStats["archetype"] = "Not Enough Data";
  let blurb = "Player hasn't played enough minutes to form a reliable performance profile.";

  if (appearances >= minApps || total_mins >= minMinutes) {
    // Dynamic Halves: Combine buckets to overcome TFDR compressing the extreme ends of the spectrum.
    const hardMins = fdrBuckets[4].mins + fdrBuckets[5].mins;
    const hardPts = fdrBuckets[4].pts + fdrBuckets[5].pts;
    const easyMins = fdrBuckets[2].mins + fdrBuckets[3].mins;
    const easyPts = fdrBuckets[2].pts + fdrBuckets[3].pts;

    const hasEasyData = easyMins >= 180;
    const hasHardData = hardMins >= 180;

    const easyPP90 = hasEasyData ? (easyPts / easyMins) * 90 : 0;
    const hardPP90 = hasHardData ? (hardPts / hardMins) * 90 : 0;
    const gradient = hasEasyData && hasHardData ? hardPP90 - easyPP90 : 0;

    // Reliability Gatekeeper: Non-starters are mathematically barred from gradient archetypes.
    // Uses fit_reliability_score so injury absences don't wrongly suppress the gate.
    if (fit_reliability_score < 0.6) {
      // Rotation Risk: Gets decent minutes or cameo returns but rarely starts
      if (total_mins > 300 || appearances >= 10 || (cameo_count >= 3 && cameo_pp_per_app >= 3.0)) {
        archetype = "Rotation Risk";
        blurb = "Subject to heavy managerial rotation. Sees the pitch often but is difficult to rely on for consistent starting points.";
      }
      // Squad Player: Bench warmer with minimal impact
      else {
        archetype = "Squad Player";
        blurb = "Primarily a depth piece. Sees very limited minutes with negligible FPL impact.";
      }
    } else {
    // xG validation helpers — apply once player meets the base classification threshold (≥270 mins)
    const isMidOrFwd = playerType === 3 || playerType === 4;
    const isGkOrDef = playerType === 1 || playerType === 2;
    const hasXGData = player && total_mins >= 270;
    const xGIper90 = hasXGData ? (player.expected_goals_per_90 ?? 0) + (player.expected_assists_per_90 ?? 0) : null;
    const xGCper90 = hasXGData ? (player.expected_goals_conceded_per_90 ?? 0) : null;

    // Flat Track Bully — strong easy-fixture bias with modest hard-fixture output
    if (hasEasyData && hasHardData && gradient < -1.5 && hardPP90 < 4.0) {
      // MID/FWD: require xGI/90 ≥ 0.20 to confirm attacking output is real
      if (isMidOrFwd && xGIper90 !== null && xGIper90 < 0.20) {
        archetype = "Workhorse";
        blurb = "A reliable starter who delivers steady but unspectacular returns. A solid squad filler with a known floor but limited ceiling.";
      } else {
        archetype = "Flat Track Bully";
        blurb = "Capitalises heavily on weak opponents but drops off against tough defenses. A prime target during favourable fixture runs.";
      }
    }
    // Talisman — elite output backed by underlying expected stats
    else if (
      (hasEasyData && hasHardData && hardPP90 >= 4.0) ||
      (!(hasEasyData && hasHardData) && efficiency_rating >= 4.0)
    ) {
      // MID/FWD: require xGI/90 ≥ 0.35 to confirm elite output is real
      if (isMidOrFwd && xGIper90 !== null && xGIper90 < 0.35) {
        archetype = "Workhorse";
        blurb = "A reliable starter who delivers steady but unspectacular returns. A solid squad filler with a known floor but limited ceiling.";
      }
      // GK/DEF: require xGC/90 ≤ 1.30 (meaningfully above league average ~1.15)
      else if (isGkOrDef && xGCper90 !== null && xGCper90 > 1.30) {
        archetype = "Workhorse";
        blurb = "A reliable starter who delivers steady but unspectacular returns. A solid squad filler with a known floor but limited ceiling.";
      } else {
        archetype = "Talisman";
        blurb = "An elite contributor whose high Points Per 90 is backed by strong underlying expected output. A premium pick across all fixture types.";
      }
    }
    // Workhorse — default fallback for reliable starters
    else {
      archetype = "Workhorse";
      blurb = "A reliable starter who delivers steady but unspectacular returns. A solid squad filler with a known floor but limited ceiling.";
    }
    } // end else (reliability >= 0.6)
  }

  return {
    pp90_fdr2,
    pp90_fdr3,
    pp90_fdr4,
    pp90_fdr5,
    base_pp90,
    total_minutes: total_mins,
    appearances,
    reliability_score,
    fit_reliability_score,
    efficiency_rating,
    cameo_pp_per_app,
    archetype,
    archetype_blurb: blurb,
  };
}

export interface LiveStandings {
  [teamId: number]: {
    position: number;
    points: number;
    gd: number;
    gf: number;
    ga: number;
    gf_home: number;
    gf_away: number;
    ga_home: number;
    ga_away: number;
    rank_attack_overall: number;
    rank_defense_overall: number;
    rank_attack_home: number;
    rank_defense_home: number;
    rank_attack_away: number;
    rank_defense_away: number;
  }
}

export function calculateLiveStandings(fixtures: Fixture[]): LiveStandings {
  const table: Record<number, any> = {};

  // Initialize table
  for (let i = 1; i <= 20; i++) {
    table[i] = {
      points: 0, gd: 0, gf: 0, ga: 0,
      gf_home: 0, gf_away: 0, ga_home: 0, ga_away: 0
    };
  }

  for (const match of fixtures) {
    if (!match.finished || match.team_h_score === null || match.team_a_score === null) continue;

    const h = match.team_h;
    const a = match.team_a;
    const hScore = match.team_h_score;
    const aScore = match.team_a_score;

    if (!table[h]) table[h] = { points: 0, gd: 0, gf: 0, ga: 0, gf_home: 0, gf_away: 0, ga_home: 0, ga_away: 0 };
    if (!table[a]) table[a] = { points: 0, gd: 0, gf: 0, ga: 0, gf_home: 0, gf_away: 0, ga_home: 0, ga_away: 0 };

    table[h].gf += hScore;
    table[h].ga += aScore;
    table[a].gf += aScore;
    table[a].ga += hScore;

    table[h].gd += (hScore - aScore);
    table[a].gd += (aScore - hScore);

    table[h].gf_home += hScore;
    table[h].ga_home += aScore;
    table[a].gf_away += aScore;
    table[a].ga_away += hScore;

    if (hScore > aScore) {
      table[h].points += 3;
    } else if (aScore > hScore) {
      table[a].points += 3;
    } else {
      table[h].points += 1;
      table[a].points += 1;
    }
  }

  const getSortedBy = (sortFn: (tA: any, tB: any) => number) => {
    return Object.keys(table).map(Number).sort((a, b) => sortFn(table[a], table[b]));
  };

  const sortedOverall = getSortedBy((ta, tb) => {
    if (tb.points !== ta.points) return tb.points - ta.points;
    if (tb.gd !== ta.gd) return tb.gd - ta.gd;
    return tb.gf - ta.gf;
  });

  // Rank 1 = most goals scored
  const rank_attack_overall = getSortedBy((ta, tb) => tb.gf - ta.gf);
  const rank_attack_home = getSortedBy((ta, tb) => tb.gf_home - ta.gf_home);
  const rank_attack_away = getSortedBy((ta, tb) => tb.gf_away - ta.gf_away);

  // Rank 1 = fewest goals conceded
  const rank_defense_overall = getSortedBy((ta, tb) => ta.ga - tb.ga);
  const rank_defense_home = getSortedBy((ta, tb) => ta.ga_home - tb.ga_home);
  const rank_defense_away = getSortedBy((ta, tb) => ta.ga_away - tb.ga_away);

  const standings: LiveStandings = {};
  Object.keys(table).map(Number).forEach(teamId => {
    standings[teamId] = {
      ...table[teamId],
      position: sortedOverall.indexOf(teamId) + 1,
      rank_attack_overall: rank_attack_overall.indexOf(teamId) + 1,
      rank_attack_home: rank_attack_home.indexOf(teamId) + 1,
      rank_attack_away: rank_attack_away.indexOf(teamId) + 1,
      rank_defense_overall: rank_defense_overall.indexOf(teamId) + 1,
      rank_defense_home: rank_defense_home.indexOf(teamId) + 1,
      rank_defense_away: rank_defense_away.indexOf(teamId) + 1,
    };
  });

  return standings;
}

// Attack form: sum of goals scored over last 5 games in context.
// Used for defense_fdr — how dangerous is this opponent's attack right now?
export function calculateAttackForm(teamId: number, fixtures: Fixture[], context: 'home' | 'away'): number {
  const teamMatches = fixtures
    .filter(f => {
      if (!f.finished || f.team_h_score === null || f.team_a_score === null) return false;
      return context === 'home' ? f.team_h === teamId : f.team_a === teamId;
    })
    .sort((a, b) => (b.event - a.event) || (b.id - a.id))
    .slice(0, 5);

  return teamMatches.reduce((sum, match) => {
    const goals = context === 'home' ? match.team_h_score! : match.team_a_score!;
    return sum + goals;
  }, 0);
}

// Defense form: sum of goals conceded over last 5 games in context.
// Used for attack_fdr — how leaky is this opponent's defense right now?
export function calculateDefenseForm(teamId: number, fixtures: Fixture[], context: 'home' | 'away'): number {
  const teamMatches = fixtures
    .filter(f => {
      if (!f.finished || f.team_h_score === null || f.team_a_score === null) return false;
      return context === 'home' ? f.team_h === teamId : f.team_a === teamId;
    })
    .sort((a, b) => (b.event - a.event) || (b.id - a.id))
    .slice(0, 5);

  return teamMatches.reduce((sum, match) => {
    const conceded = context === 'home' ? match.team_a_score! : match.team_h_score!;
    return sum + conceded;
  }, 0);
}

// Returns an unbounded composite score. Call normalizeTFDRMap after computing all teams.
export function calculateRawTFDR(baseFDR: number, opponentRank: number, formValue: number, lowerIsHarder = false): number {
  // 1. Rank-based Modifier
  // Harder base FDRs (4+) benefit more from lower opponent ranks (negative modifier)
  // Neutral FDRs (3) centered around 0.5 shift
  // Easy FDRs (2) start with a penalty that drops as rank improves
  let rankModifier = 0;
  if (baseFDR >= 4) {
    rankModifier = -((opponentRank - 1) / 19) * 1.5;
  } else if (baseFDR === 3) {
    rankModifier = 0.5 - ((opponentRank - 1) / 19) * 1.5;
  } else {
    rankModifier = 1.0 - ((opponentRank - 1) / 19) * 1.25;
  }

  // 2. Form-based Modifier
  // Maps goals (0-13+) to a discrete modifier scale
  let formModifier = 0;
  if (formValue >= 13) formModifier = 0.75;
  else if (formValue >= 10) formModifier = 0.5;
  else if (formValue >= 7) formModifier = 0;
  else if (formValue >= 4) formModifier = -0.25;
  else formModifier = -0.75;

  // Flip form impact if lowerIsHarder (e.g., high goals conceded is EASY for attackers)
  const finalFormModifier = lowerIsHarder ? -formModifier : formModifier;

  // 3. Composite Calculation
  const tfdr = baseFDR + rankModifier + finalFormModifier;
  
  // Return clamped value with 2 decimal precision
  return parseFloat(Math.max(1.5, Math.min(5.5, tfdr)).toFixed(2));
}

// Normalize each (context, dimension) independently so all 20 teams span 1.5-5.5.
export function normalizeTFDRMap(
  rawMap: Record<number, { home: Record<string, number>; away: Record<string, number> }>
): Record<number, { home: Record<string, number>; away: Record<string, number> }> {
  const keys = ['defense_fdr', 'attack_fdr', 'overall'] as const;
  const contexts = ['home', 'away'] as const;

  for (const ctx of contexts) {
    for (const key of keys) {
      const entries = Object.keys(rawMap).map(Number);
      const sorted = [...entries].sort((a, b) => rawMap[a][ctx][key] - rawMap[b][ctx][key]);
      sorted.forEach((teamId, idx) => {
        rawMap[teamId][ctx][key] = parseFloat(
          (1.5 + (idx / (sorted.length - 1)) * 4.0).toFixed(2)
        );
      });
    }
  }
  return rawMap;
}

// --- Season Priors: types and blending ---

export interface PlayerPrior {
  web_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  total_points: number;
  points_per_game: string;
  base_pp90: number;
  pp90_fdr2: number | null;
  pp90_fdr3: number | null;
  pp90_fdr4: number | null;
  pp90_fdr5: number | null;
  reliability_score: number;
  efficiency_rating: number;
  archetype: string;
  appearances: number;
  total_minutes: number;
}

export interface SeasonPriors {
  season: string;
  archivedAt: string;
  teamStandings: LiveStandings;
  tfdrMap: Record<number, { home: Record<string, number>; away: Record<string, number> }>;
  teams: Array<{ id: number; name: string; short_name: string; strength: number }>;
  players: Record<number, PlayerPrior>;
}

/**
 * Blends a current-season value with a prior-season value using a decay formula.
 * Prior weight decays linearly from 1.0 (0 appearances) to 0.0 (10+ appearances).
 * 
 * @param currentValue - The value from the current season (may be null if no data yet)
 * @param priorValue - The value from the archived prior season (may be null)
 * @param currentAppearances - How many appearances the player has in the current season
 * @returns The blended value, or whichever is available
 */
export function blendValue(
  currentValue: number | null,
  priorValue: number | null,
  currentAppearances: number
): number | null {
  const priorWeight = Math.max(0, 1 - (currentAppearances / 10));
  const currentWeight = 1 - priorWeight;

  // Both available → weighted blend
  if (currentValue !== null && priorValue !== null) {
    return parseFloat((currentValue * currentWeight + priorValue * priorWeight).toFixed(2));
  }
  // Only current → use it (prior has faded or never existed)
  if (currentValue !== null) return currentValue;
  // Only prior → use it (early season, no current data yet)
  if (priorValue !== null) return parseFloat((priorValue * priorWeight).toFixed(2));
  // Neither → null
  return null;
}

/**
 * Blends a full PerformanceStats profile with a player's prior-season data.
 * Returns a new profile with blended PP90 values while keeping current-season
 * archetype and reliability (those shouldn't be averaged).
 *
 * @param currentTeamId - The player's CURRENT team ID (from live FPL data).
 *   If this differs from prior.team, the player changed clubs. In that case:
 *   - FDR-bucketed PP90s are discarded (they were calibrated for a different squad/schedule)
 *   - base_pp90 gets a 50% haircut (raw scoring ability travels, context doesn't)
 *   - Archetype label is preserved as a stylistic hint only
 */
export function blendPerformanceWithPrior(
  current: PerformanceStats,
  prior: PlayerPrior | undefined,
  currentTeamId?: number
): PerformanceStats {
  if (!prior) return current;

  const appearances = current.appearances;

  // If current season has 10+ appearances, prior is fully decayed
  if (appearances >= 10) return current;

  const priorWeight = Math.max(0, 1 - (appearances / 10));

  // --- Phase 4: Transfer Detection ---
  // If the player changed clubs, their prior PP90s are club-context-specific and
  // should not be blindly applied. Discard FDR-bucketed priors, keep archetype only.
  const changedClubs = currentTeamId !== undefined && prior.team !== currentTeamId;

  if (changedClubs) {
    // Only blend archetype + a discounted base_pp90 (raw talent travels, team context doesn't)
    const discountedPriorPP90 = prior.base_pp90 > 0 ? prior.base_pp90 * 0.5 : null;
    return {
      ...current,
      base_pp90: blendValue(current.base_pp90 || null, discountedPriorPP90, appearances) ?? current.base_pp90,
      // FDR-bucketed values: don't blend — they were calibrated against a different set of opponents
      pp90_fdr2: current.pp90_fdr2,
      pp90_fdr3: current.pp90_fdr3,
      pp90_fdr4: current.pp90_fdr4,
      pp90_fdr5: current.pp90_fdr5,
      // Don't blend reliability — prior club context made it unreliable as a predictor
      reliability_score: current.reliability_score,
      // Keep archetype as a stylistic hint — migrate old names to new system
      archetype: current.archetype === "Not Enough Data" && prior.archetype !== "Not Enough Data"
        ? migratePriorArchetype(prior.archetype)
        : current.archetype,
      archetype_blurb: current.archetype === "Not Enough Data" && prior.archetype !== "Not Enough Data"
        ? `Prior season at previous club: ${prior.archetype}. Current season data still building.`
        : current.archetype_blurb
    };
  }

  // --- Same club: full blend ---
  return {
    ...current,
    base_pp90: blendValue(current.base_pp90 || null, prior.base_pp90 || null, appearances) ?? current.base_pp90,
    pp90_fdr2: blendValue(current.pp90_fdr2, prior.pp90_fdr2, appearances),
    pp90_fdr3: blendValue(current.pp90_fdr3, prior.pp90_fdr3, appearances),
    pp90_fdr4: blendValue(current.pp90_fdr4, prior.pp90_fdr4, appearances),
    pp90_fdr5: blendValue(current.pp90_fdr5, prior.pp90_fdr5, appearances),
    reliability_score: appearances < 3
      ? parseFloat((prior.reliability_score * priorWeight + current.reliability_score * (1 - priorWeight)).toFixed(2))
      : current.reliability_score,
    archetype: current.archetype === "Not Enough Data" && prior.archetype !== "Not Enough Data"
      ? migratePriorArchetype(prior.archetype)
      : current.archetype,
    archetype_blurb: current.archetype === "Not Enough Data" && prior.archetype !== "Not Enough Data"
      ? `Prior season: ${prior.archetype}. Current season data still building.`
      : current.archetype_blurb
  };
}

/** Maps old archetype names (from prior-season data) to the current 5-archetype system. */
function migratePriorArchetype(name: string): PerformanceStats["archetype"] {
  const map: Record<string, PerformanceStats["archetype"]> = {
    "Consistent Performer": "Talisman",
    "Game Raiser": "Workhorse",
    "Steady Earner": "Workhorse",
    "Low Performer": "Workhorse",
    "Flat Track Bully": "Flat Track Bully",
    "Rotation Risk": "Rotation Risk",
    "Squad Player": "Squad Player",
    "Talisman": "Talisman",
    "Workhorse": "Workhorse",
  };
  return map[name] ?? "Workhorse";
}
