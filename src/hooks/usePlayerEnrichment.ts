import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics, isLongTermInjured } from "../utils/player";
import { getNextFixtures } from "../utils/fixtures";
import { calculatePerformanceProfile, blendPerformanceWithPrior, SeasonPriors } from "../utils/metrics";

export function enrichPlayer(
  player: Player,
  summary: PlayerSummary | undefined,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  seasonPriors: SeasonPriors | null,
  pickOverrides?: Record<string, any>
): any {
  const metrics = calculateLast5Metrics(summary, player.status);
  const nextFixtures = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);
  const fdr = nextFixtures.length > 0
    ? parseFloat((nextFixtures.reduce((s, f) => s + f.difficulty, 0) / nextFixtures.length).toFixed(2))
    : 3;
  const qualityScore = summary ? metrics.points : parseFloat(player.form);
  const fplForm = parseFloat(player.form);
  let perfProfile = summary
    ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type)
    : null;

  if (perfProfile && seasonPriors?.players?.[player.id]) {
    perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[player.id], player.team);
  }

  const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
  const priceEstimate = player.now_cost / 20;
  const fallback = perfProfile?.base_pp90 ?? (qualityScore || priceEstimate);
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
  const seasonPPG = parseFloat(player.points_per_game) || priceEstimate;
  const basementFloor = seasonPPG * 5;
  const weightedScore = (xPts5GW * 0.75) + (basementFloor * 0.25);

  return {
    ...player,
    ...(pickOverrides ?? {}),
    fdr,
    fplForm,
    qualityScore,
    valueScore: parseFloat((weightedScore * reliability * availabilityMultiplier).toFixed(2)),
    perfProfile
  };
}
