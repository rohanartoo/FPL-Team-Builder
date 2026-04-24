import { useMemo } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics, getAvailabilityMultiplier } from "../utils/player";
import { getNextFixtures } from "../utils/fixtures";
import {
  calculatePerformanceProfile,
  blendPerformanceWithPrior,
  SeasonPriors,
} from "../utils/metrics";
import {
  calculateXPts,
  calculateBasementFloor,
  calculateValueScore,
  averageFixtureDifficulty,
} from "../utils/playerValue";

interface InjuryPeriods {
  players: Record<number, any>;
}

export function useGlobalPerformanceRoster(
  players: Player[],
  playerSummaries: Record<number, PlayerSummary>,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  seasonPriors: SeasonPriors | null,
  injuryPeriods: InjuryPeriods | null
) {
  return useMemo(() => {
    return players.map(p => {
      const summary = playerSummaries[p.id];
      const metrics = calculateLast5Metrics(summary, p.status);
      const nextFixtures = getNextFixtures(p.team, fixtures, teams, tfdrMap, 5, 0, p.element_type);
      const fdr = averageFixtureDifficulty(nextFixtures);
      const fplForm = parseFloat(p.form);
      const qualityScore = summary ? metrics.points : fplForm;

      let perfProfile = summary
        ? calculatePerformanceProfile(
            summary.history, fixtures, tfdrMap, p.status,
            3, 270, p.element_type, p,
            injuryPeriods?.players[p.id]
          )
        : null;

      if (perfProfile && seasonPriors?.players?.[p.id]) {
        perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[p.id], p.team);
      }

      const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
      const priceEstimate = p.now_cost / 20;
      const fallback = perfProfile?.base_pp90 ?? (qualityScore || priceEstimate);
      const availabilityMultiplier = getAvailabilityMultiplier(p);

      // Use fit_reliability_score for available players — injury absences don't suppress nailed starters
      const reliability = hasReliableProfile
        ? (p.status === 'a'
            ? Math.max(perfProfile!.fit_reliability_score, perfProfile!.reliability_score)
            : perfProfile!.reliability_score)
        : 1;

      const seasonPPG = parseFloat(p.points_per_game) || priceEstimate;
      const xPts5GW = calculateXPts(perfProfile, nextFixtures, fallback);
      const basementFloor = calculateBasementFloor(p, seasonPPG);
      const valueScore = calculateValueScore(xPts5GW, basementFloor, reliability, availabilityMultiplier);
      const valueEfficiency = parseFloat((valueScore / (p.now_cost / 10)).toFixed(2));

      return {
        ...p,
        fdr,
        fplForm,
        qualityScore,
        valueScore,
        valueEfficiency,
        metrics,
        perfProfile,
      };
    });
  }, [players, playerSummaries, fixtures, teams, tfdrMap, seasonPriors, injuryPeriods]);
}
