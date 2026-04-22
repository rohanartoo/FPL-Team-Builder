import { Player, Fixture, ChipStatus, ChipRecommendation, ScoreParams } from "../types";

/**
 * Simple scoring engine for FPL chips.
 *
 * - Wildcard / Free Hit: reward blank GWs (low squad coverage).
 * - Bench Boost: reward GWs with many bench players (here approximated by double‑gameweek count).
 * - Triple Captain: reward GWs where the captain (player with highest pp90) has an easy fixture.
 *
 * The function returns a sorted list of recommendations per chip.
 */
export function scoreChipWindows(params: ScoreParams): ChipRecommendation[] {
  const { squad, fixtures, chipStatus, currentGw, horizon = 10 } = params;
  const gws = Array.from({ length: horizon }, (_, i) => currentGw + i).filter(gw => gw <= 38);

  // Helper: get fixtures for a given GW
  const fixturesByGw = new Map<number, Fixture[]>();
  for (const f of fixtures) {
    if (!fixturesByGw.has(f.event)) fixturesByGw.set(f.event, []);
    fixturesByGw.get(f.event)!.push(f);
  }

  // Pre‑compute per‑GW squad coverage and double‑gameweek counts
  const gwStats = gws.map(gw => {
    const fgs = fixturesByGw.get(gw) || [];
    
    let squadDifficultySum = 0;
    let squadFixtureCount = 0;

    // players with at least one fixture
    const coverage = squad.filter(p => {
      const pFixtures = fgs.filter(f => f.team_h === p.team || f.team_a === p.team);
      pFixtures.forEach(f => {
         squadDifficultySum += (f.team_h === p.team) ? (f.team_h_difficulty || 3) : (f.team_a_difficulty || 3);
         squadFixtureCount++;
      });
      return pFixtures.length > 0;
    }).length;

    // players with two fixtures (double gameweek)
    const dgwCount = squad.filter(p => {
      const cnt = fgs.filter(f => f.team_h === p.team || f.team_a === p.team).length;
      return cnt >= 2;
    }).length;

    // Determine average difficulty for squad
    const avgDiff = squadFixtureCount > 0 ? squadDifficultySum / squadFixtureCount : 3;

    return { gw, coverage, dgwCount, avgDiff, fixtures: fgs };
  });

  // Capture captain pp90 (use highest base_pp90 among squad as proxy)
  const captainPP90 = Math.max(
    0,
    ...squad.map(p => p.perfProfile?.base_pp90 ?? 0)
  );

  // Scoring per chip
  const recommendations: ChipRecommendation[] = [];

  // Wildcard scoring – prioritize blank GWs (coverage == 0)
  if (chipStatus.wildcard) {
    const scores = gwStats.map(s => ({
      gw: s.gw,
      score: s.coverage === 0 ? 100 : (15 - s.coverage) * 2 // more uncovered = higher
    }));
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    recommendations.push({
      chip: 'Wildcard',
      bestGw: sorted[0].gw,
      bestScore: sorted[0].score,
      alternatives: sorted.slice(1, 4)
    });
  }

  // Free Hit scoring – similar to wildcard but higher weight on blanks
  if (chipStatus.freehit) {
    const scores = gwStats.map(s => ({
      gw: s.gw,
      score: s.coverage === 0 ? 120 : (15 - s.coverage) * 1.5
    }));
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    recommendations.push({
      chip: 'Free Hit',
      bestGw: sorted[0].gw,
      bestScore: sorted[0].score,
      alternatives: sorted.slice(1, 4)
    });
  }

  // Bench Boost – reward double‑gameweek counts, tie-break with easy fixture difficulty
  if (chipStatus.benchBoost) {
    const scores = gwStats.map(s => ({
      gw: s.gw,
      score: (s.dgwCount * 10) + (6 - s.avgDiff) // each double adds value, easier avgDiff gives slight boost
    }));
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    recommendations.push({
      chip: 'Bench Boost',
      bestGw: sorted[0].gw,
      bestScore: sorted[0].score,
      alternatives: sorted.slice(1, 4)
    });
  }

  // Triple Captain – reward low difficulty for captain
  if (chipStatus.tripleCaptain) {
    const scores = gwStats.map(s => {
      // average difficulty weighted by captain pp90 (higher pp90 prefers easier fixtures)
      const diffFactor = 6 - s.avgDiff; // lower diff => higher factor
      const score = captainPP90 * diffFactor;
      return { gw: s.gw, score };
    });
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    recommendations.push({
      chip: 'Triple Captain',
      bestGw: sorted[0].gw,
      bestScore: sorted[0].score,
      alternatives: sorted.slice(1, 4)
    });
  }

  return recommendations;
}
