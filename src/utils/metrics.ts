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
  archetype: "Game Raiser" | "Consistent Performer" | "Flat Track Bully" | "Dud" | "Impact Sub" | "Rotation Risk" | "Squad Player" | "Not Enough Data";
  archetype_blurb: string;
}

export function calculatePerformanceProfile(
  history: any[],
  fixtures: Fixture[],
  tfdrMap?: Record<number, { home: number; away: number; overall: number }>,
  minApps = 5,
  minMinutes = 450
): PerformanceStats {
  // Guard: if history is not a valid array (e.g. API returning a string during maintenance), return a safe default
  if (!Array.isArray(history) || history.length === 0) {
    return {
      pp90_fdr2: null, pp90_fdr3: null, pp90_fdr4: null, pp90_fdr5: null,
      base_pp90: 0, total_minutes: 0, appearances: 0,
      reliability_score: 0, efficiency_rating: 0, cameo_pp_per_app: 0,
      archetype: "Not Enough Data",
      archetype_blurb: "Player hasn't played enough minutes to form a reliable performance profile.",
    };
  }

  let fdrBuckets: Record<number, { pts: number; mins: number }> = {
    2: { pts: 0, mins: 0 },
    3: { pts: 0, mins: 0 },
    4: { pts: 0, mins: 0 },
    5: { pts: 0, mins: 0 },
  };

  let total_pts = 0;
  let total_mins = 0;
  let appearances = 0;
  let starts = 0;
  let starts_pts = 0;
  let starts_mins = 0;
  let cameo_count = 0;  // appearances with > 0 but < 60 minutes
  let cameo_pts = 0;    // total points accumulated in those cameo appearances
  const total_matches = history.length;

  for (const match of history) {
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
      // Cameo: played but didn't complete 60 mins (genuine substitute appearance)
      cameo_count++;
      cameo_pts += match.total_points;
    }

    const fixture = fixtures.find((f) => f.id === match.fixture);
    let fdr = 3; // generic fallback

    if (fixture) {
      if (tfdrMap) {
        const oppTeam = match.was_home ? fixture.team_a : fixture.team_h;
        // Our player plays at home => Opponent plays away (so we want Opponent's Away TFDR)
        const oppContext = match.was_home ? 'away' : 'home';
        fdr = tfdrMap[oppTeam]?.[oppContext] || (match.was_home ? fixture.team_h_difficulty : fixture.team_a_difficulty);
      } else {
        fdr = match.was_home ? fixture.team_h_difficulty : fixture.team_a_difficulty;
      }
    }

    fdr = Math.round(Math.max(2, Math.min(5, fdr)));

    // FDR buckets use starts-only minutes for the efficiency baseline
    if (isStart) {
      fdrBuckets[fdr].pts += match.total_points;
      fdrBuckets[fdr].mins += match.minutes;
    }
  }

  const reliability_score = total_matches > 0 ? starts / total_matches : 0;
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
      // Impact Sub: Elite cameo stats
      if (cameo_count >= 3 && cameo_pp_per_app >= 3.0) {
        archetype = "Impact Sub";
        blurb = `Frequently returns attacking points off the bench, averaging ${cameo_pp_per_app.toFixed(1)} pts per cameo appearance.`;
      } 
      // Rotation Risk: Gets decent minutes but rarely starts
      else if (total_mins > 300 || appearances >= 10) {
        archetype = "Rotation Risk";
        blurb = "Subject to heavy managerial rotation. Sees the pitch often but is difficult to rely on for consistent starting points.";
      } 
      // Squad Player: Bench warmer with minimal impact
      else {
        archetype = "Squad Player";
        blurb = "Primarily a depth piece. Sees very limited minutes with negligible FPL impact.";
      }
    }
    // Dud: a regular starter who consistently underperforms across starts.
    else if (efficiency_rating < 3.0 && starts >= 3) {
      archetype = "Dud";
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
      archetype = "Consistent Performer";
      blurb = "Delivers a remarkably stable Points Per 90 regardless of fixture difficulty.";
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
  }
}

export function calculateLiveStandings(fixtures: Fixture[]): LiveStandings {
  const table: Record<number, { points: number; gd: number; gf: number }> = {};
  
  // Initialize table
  for (let i = 1; i <= 20; i++) {
    table[i] = { points: 0, gd: 0, gf: 0 };
  }

  for (const match of fixtures) {
    if (!match.finished || match.team_h_score === null || match.team_a_score === null) continue;
    
    const h = match.team_h;
    const a = match.team_a;
    const hScore = match.team_h_score;
    const aScore = match.team_a_score;

    if (!table[h]) table[h] = { points: 0, gd: 0, gf: 0 };
    if (!table[a]) table[a] = { points: 0, gd: 0, gf: 0 };

    table[h].gf += hScore;
    table[a].gf += aScore;
    table[h].gd += (hScore - aScore);
    table[a].gd += (aScore - hScore);

    if (hScore > aScore) {
      table[h].points += 3;
    } else if (aScore > hScore) {
      table[a].points += 3;
    } else {
      table[h].points += 1;
      table[a].points += 1;
    }
  }

  const sortedTeams = Object.keys(table)
    .map(Number)
    .sort((a, b) => {
      if (table[b].points !== table[a].points) return table[b].points - table[a].points;
      if (table[b].gd !== table[a].gd) return table[b].gd - table[a].gd;
      return table[b].gf - table[a].gf;
    });

  const standings: LiveStandings = {};
  sortedTeams.forEach((teamId, index) => {
    standings[teamId] = {
      ...table[teamId],
      position: index + 1
    };
  });

  return standings;
}

export function calculateLiveForm(teamId: number, fixtures: Fixture[], context: 'home' | 'away' | 'overall' = 'overall'): number {
  const teamMatches = fixtures
    .filter(f => {
      if (!f.finished || f.team_h_score === null || f.team_a_score === null) return false;
      if (context === 'home') return f.team_h === teamId;
      if (context === 'away') return f.team_a === teamId;
      return f.team_h === teamId || f.team_a === teamId;
    })
    .sort((a, b) => (b.event - a.event) || (b.id - a.id)) // Most recent first
    .slice(0, 5);

  let formPoints = 0;
  for (const match of teamMatches) {
    const isHome = match.team_h === teamId;
    const teamScore = isHome ? match.team_h_score! : match.team_a_score!;
    const oppScore = isHome ? match.team_a_score! : match.team_h_score!;

    if (teamScore > oppScore) formPoints += 3;
    else if (teamScore === oppScore) formPoints += 1;
  }

  return formPoints;
}

export function calculateTFDR(baseFDR: number, position: number, formPoints: number): number {
  let positionModifier = 0;

  // Expected positions based on base FDR
  if (baseFDR >= 4) { // Expected Top 6
    if (position >= 1 && position <= 4) positionModifier = 0;
    else if (position >= 5 && position <= 8) positionModifier = -0.25;
    else if (position >= 9 && position <= 14) positionModifier = -0.5;
    else if (position >= 15 && position <= 17) positionModifier = -1.0;
    else if (position >= 18 && position <= 20) positionModifier = -1.5;
  } else if (baseFDR === 3) { // Expected Mid-Table
    if (position >= 1 && position <= 4) positionModifier = 0.5;
    else if (position >= 5 && position <= 8) positionModifier = 0.25;
    else if (position >= 9 && position <= 14) positionModifier = 0;
    else if (position >= 15 && position <= 17) positionModifier = -0.5;
    else if (position >= 18 && position <= 20) positionModifier = -1.0;
  } else { // Expected Bottom 6 (baseFDR 2)
    if (position >= 1 && position <= 4) positionModifier = 1.0;
    else if (position >= 5 && position <= 8) positionModifier = 0.75;
    else if (position >= 9 && position <= 14) positionModifier = 0.5;
    else if (position >= 15 && position <= 17) positionModifier = 0;
    else if (position >= 18 && position <= 20) positionModifier = -0.25;
  }

  let formModifier = 0;
  if (formPoints >= 13) formModifier = 0.75;
  else if (formPoints >= 10) formModifier = 0.5;
  else if (formPoints >= 7) formModifier = 0;
  else if (formPoints >= 4) formModifier = -0.25;
  else formModifier = -0.75;

  let tfdr = baseFDR + positionModifier + formModifier;
  return parseFloat(Math.max(1.5, Math.min(5.5, tfdr)).toFixed(2)); // Clamp between 1.5 and 5.5
}

