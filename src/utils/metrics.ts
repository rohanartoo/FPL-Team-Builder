import { Fixture } from "../types";

export interface PerformanceStats {
  pp90_fdr2: number | null;
  pp90_fdr3: number | null;
  pp90_fdr4: number | null;
  pp90_fdr5: number | null;
  base_pp90: number;
  total_minutes: number;
  appearances: number;
  reliability_score: number;
  efficiency_rating: number;
  cameo_pp_per_app: number;
  archetype: "Game Raiser" | "Consistent Performer" | "Steady Earner" | "Flat Track Bully" | "Low Performer" | "Rotation Risk" | "Squad Player" | "Not Enough Data";
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

  // 2. Evaluate each Gap
  gaps.forEach(gapIndices => {
    const firstIdx = gapIndices[0];
    const lastIdx = gapIndices[gapIndices.length - 1];

    const gamesBefore = history.slice(0, firstIdx).filter(m => m.minutes > 0);
    const last5PlayedBefore = gamesBefore.slice(-5);
    const wasRegularBefore = last5PlayedBefore.length > 0 &&
      (last5PlayedBefore.filter(m => m.minutes >= 60).length / last5PlayedBefore.length) >= 0.8;

    const gamesAfter = history.slice(lastIdx + 1).filter(m => m.minutes > 0);
    const first5PlayedAfter = gamesAfter.slice(0, 5);
    const isRegularAfter = first5PlayedAfter.length > 0 &&
      (first5PlayedAfter.filter(m => m.minutes >= 60).length / first5PlayedAfter.length) >= 0.8;

    if (wasRegularBefore && isRegularAfter) {
      gapIndices.forEach(idx => excused_matches.add(idx));
    }
    else if (wasRegularBefore && lastIdx === history.length - 1 && (player_status === 'i' || player_status === 's' || player_status === 'd')) {
      gapIndices.forEach(idx => excused_matches.add(idx));
    }
  });

  return excused_matches;
}

export function calculatePerformanceProfile(
  history: any[],
  fixtures: Fixture[],
  tfdrMap?: Record<number, any>,
  player_status?: string,
  minApps = 3,
  minMinutes = 270,
  playerType?: number
): PerformanceStats {
  // Guard: if history is not a valid array
  if (!Array.isArray(history) || history.length === 0) {
    return {
      pp90_fdr2: null, pp90_fdr3: null, pp90_fdr4: null, pp90_fdr5: null,
      base_pp90: 0, total_minutes: 0, appearances: 0,
      reliability_score: 0, efficiency_rating: 0, cameo_pp_per_app: 0,
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

  // 1. Group non-starts (< 60 mins) into "Absence Gaps"
  const excused_matches = detectExcusedMatches(history, player_status);

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
  const efficiency_rating = starts_mins > 0 ? (starts_pts / starts_mins) * 90 : 0;
  const cameo_pp_per_app = cameo_count > 0 ? cameo_pts / cameo_count : 0;
  const base_pp90 = total_mins > 0 ? parseFloat(((total_pts / total_mins) * 90).toFixed(2)) : 0;

  const getPP90 = (fdr: number) =>
    fdrBuckets[fdr].mins > 0 ? parseFloat(((fdrBuckets[fdr].pts / fdrBuckets[fdr].mins) * 90).toFixed(2)) : null;

  const pp90_fdr2 = getPP90(2);
  const pp90_fdr3 = getPP90(3);
  const pp90_fdr4 = getPP90(4);
  const pp90_fdr5 = getPP90(5);

  let archetype: PerformanceStats["archetype"] = "Not Enough Data";
  let blurb = "Player hasn't played enough minutes to form a reliable performance profile.";

  if (appearances >= minApps || total_mins >= minMinutes) {
    // Dynamic Halves: Combine buckets to overcome TFDR compressing the extreme ends of the spectrum.
    const hardMins = fdrBuckets[4].mins + fdrBuckets[5].mins;
    const hardPts = fdrBuckets[4].pts + fdrBuckets[5].pts;
    const easyMins = fdrBuckets[2].mins + fdrBuckets[3].mins;
    const easyPts = fdrBuckets[2].pts + fdrBuckets[3].pts;

    const hasEasyData = easyMins >= 90;
    const hasHardData = hardMins >= 90;

    const easyPP90 = hasEasyData ? (easyPts / easyMins) * 90 : 0;
    const hardPP90 = hasHardData ? (hardPts / hardMins) * 90 : 0;
    const gradient = hasEasyData && hasHardData ? hardPP90 - easyPP90 : 0;

    // Reliability Gatekeeper: Non-starters are mathematically barred from gradient archetypes.
    if (reliability_score < 0.6) {
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
    }
    // Low Performer: a regular starter who consistently underperforms across starts.
    else if (efficiency_rating < 3.0 && starts >= 3) {
      archetype = "Low Performer";
      blurb = "Starts regularly but struggles to deliver meaningful points per 90 across those appearances.";
    }
    // FDR gradient archetypes — only fire when the player has genuine data at both ends.
    else if (hasEasyData && hasHardData && gradient > 1.0) {
      archetype = "Game Raiser";
      blurb = "Thrives in tough fixtures, yielding a significantly higher Points Per 90 against stronger opposition.";
    } else if (hasEasyData && hasHardData && gradient < -1.5) {
      if (hardPP90 >= 4.0) {
        archetype = "Consistent Performer";
        blurb = "Delivers elite point returns overall; naturally peaks against weaker teams but remains highly reliable in tough fixtures.";
      } else {
        archetype = "Flat Track Bully";
        blurb = "Capitalizes heavily on weaker opponents but tends to drop off significantly against tough defenses.";
      }
    } else {
      if (efficiency_rating >= 4.0) {
        archetype = "Consistent Performer";
        blurb = "Delivers a remarkably stable Points Per 90 regardless of fixture difficulty.";
      } else {
        archetype = "Steady Earner";
        blurb = "A reliable starter who returns decent but average points. Rarely blanks heavily, but has a low FPL ceiling.";
      }
    }
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

