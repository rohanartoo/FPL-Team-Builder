import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics, getAvailabilityMultiplier } from "../utils/player";
import { getNextFixtures } from "../utils/fixtures";
import { calculatePerformanceProfile, blendPerformanceWithPrior, SeasonPriors } from "../utils/metrics";
import {
  calculateXPts,
  calculateBasementFloor,
  calculateSignalMultiplier,
  calculateValueScore,
  averageFixtureDifficulty,
} from "../utils/playerValue";

export function enrichPlayer(
  player: Player,
  summary: PlayerSummary | undefined,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  seasonPriors: SeasonPriors | null
): any {
  const metrics = calculateLast5Metrics(summary, player.status);
  const nextFixtures = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);
  const fdr = averageFixtureDifficulty(nextFixtures);
  const fplForm = parseFloat(player.form);
  const qualityScore = summary ? metrics.points : fplForm;

  let perfProfile = summary
    ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type, player)
    : null;

  if (perfProfile && seasonPriors?.players?.[player.id]) {
    perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[player.id], player.team);
  }

  const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
  const priceEstimate = player.now_cost / 20;
  const fallback = perfProfile?.base_pp90 ?? (qualityScore || priceEstimate);
  const reliability = hasReliableProfile ? perfProfile!.reliability_score : 1;
  const availabilityMultiplier = getAvailabilityMultiplier(player);
  const seasonPPG = parseFloat(player.points_per_game) || priceEstimate;

  const xPts5GW = calculateXPts(perfProfile, nextFixtures, fallback);
  const basementFloor = calculateBasementFloor(player, seasonPPG);
  const signalMultiplier = calculateSignalMultiplier(player);
  const valueScore = calculateValueScore(xPts5GW, basementFloor, reliability, availabilityMultiplier, signalMultiplier);

  return {
    ...player,
    fdr,
    fplForm,
    qualityScore,
    valueScore,
    perfProfile,
    metrics,
  };
}
