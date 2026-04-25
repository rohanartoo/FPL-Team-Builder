/**
 * Shared player value computation utilities.
 *
 * Used by both the frontend enrichment hook (usePlayerEnrichment / useGlobalPerformanceRoster)
 * and the server-side chat tools (enrichPlayerServer). Keeping these in one place ensures a
 * single source of truth for xPts, basement floor, signal multipliers, and valueScore — any
 * formula change propagates to both contexts automatically.
 */

import { NextFixture } from "./fixtures";
import type { PerformanceStats } from "./metrics";
import {
  LEAGUE_AVG_XGC90,
  XG_THRESHOLD_FWD, XG_THRESHOLD_MID,
  DUE_A_GOAL_MIN_MINS, DUE_A_GOAL_UNDERPERFORM_RATIO,
  REGRESSION_MIN_XG, REGRESSION_OVERPERFORM_RATIO,
} from "./constants";

/** Look up a player's expected PP90 for a given fixture difficulty. */
export function pp90AtDifficulty(
  perfProfile: PerformanceStats | null,
  fallback: number,
  difficulty: number
): number {
  const k = Math.round(Math.max(2, Math.min(5, difficulty))) as 2 | 3 | 4 | 5;
  const val = ({
    2: perfProfile?.pp90_fdr2,
    3: perfProfile?.pp90_fdr3,
    4: perfProfile?.pp90_fdr4,
    5: perfProfile?.pp90_fdr5,
  })[k];
  return val ?? fallback;
}

/** Sum fixture-adjusted expected points across upcoming fixtures. DGWs count twice. */
export function calculateXPts(
  perfProfile: PerformanceStats | null,
  nextFixtures: NextFixture[],
  fallback: number
): number {
  let xPts = 0;
  for (const fix of nextFixtures) {
    if (fix.isBlank) continue;
    const pts = pp90AtDifficulty(perfProfile, fallback, fix.difficulty);
    xPts += fix.isDouble ? pts * 2 : pts;
  }
  return xPts;
}

/**
 * Basement floor for valueScore — season PPG projected over 5 GWs, adjusted
 * by expected stats to dampen hot/cold streak noise when enough data exists.
 *
 * MID/FWD: 50/50 blend of PPG floor and xGI-derived floor.
 * GK/DEF: PPG floor modulated by xGC vs league average.
 * Fallback (< 270 mins): raw PPG floor only.
 */
export function calculateBasementFloor(player: any, seasonPPG: number): number {
  const ppgFloor = seasonPPG * 5;
  const hasXGData = (player.minutes ?? 0) >= 270;

  if (!hasXGData) return ppgFloor;

  if (player.element_type === 3 || player.element_type === 4) {
    const goalPts = player.element_type === 3 ? 5 : 4;
    const xGIpp90 =
      (player.expected_goals_per_90 ?? 0) * goalPts +
      (player.expected_assists_per_90 ?? 0) * 3;
    const xBaseline = xGIpp90 * 5;
    return ppgFloor * 0.5 + xBaseline * 0.5;
  }

  const xGC90 = player.expected_goals_conceded_per_90 ?? LEAGUE_AVG_XGC90;
  const xGCModifier = Math.max(
    0.8,
    Math.min(1.2, 1 + ((LEAGUE_AVG_XGC90 - xGC90) / LEAGUE_AVG_XGC90) * 0.3)
  );
  return ppgFloor * xGCModifier;
}

/**
 * Signal multiplier: 1.15 for genuine underliers (xG well above goals scored),
 * 0.85 for regression risks (goals well above xG). Position-adjusted xG threshold.
 */
export function calculateSignalMultiplier(player: any): number {
  const isMidOrFwd = player.element_type === 3 || player.element_type === 4;
  if (!isMidOrFwd || (player.minutes ?? 0) < DUE_A_GOAL_MIN_MINS) return 1;

  const xG = parseFloat(player.expected_goals ?? "0") || 0;
  if (xG === 0) return 1;

  const xGPer90 = player.minutes >= 90 ? (xG / player.minutes) * 90 : 0;
  const xGthreshold = player.element_type === 4 ? XG_THRESHOLD_FWD : XG_THRESHOLD_MID;

  if (xGPer90 >= xGthreshold && player.goals_scored < xG * DUE_A_GOAL_UNDERPERFORM_RATIO) return 1.15;
  if (xG >= REGRESSION_MIN_XG && player.goals_scored > xG * REGRESSION_OVERPERFORM_RATIO) return 0.85;
  return 1;
}

/** Final valueScore from its components. */
export function calculateValueScore(
  xPts5GW: number,
  basementFloor: number,
  reliability: number,
  availabilityMultiplier: number,
  signalMultiplier: number = 1
): number {
  const weightedScore = xPts5GW * 0.75 + basementFloor * 0.25;
  return parseFloat(
    (weightedScore * reliability * availabilityMultiplier * signalMultiplier).toFixed(2)
  );
}

/** Average difficulty across non-blank fixtures. */
export function averageFixtureDifficulty(nextFixtures: NextFixture[]): number {
  const nonBlank = nextFixtures.filter(f => !f.isBlank);
  if (nonBlank.length === 0) return 3;
  return parseFloat(
    (nonBlank.reduce((s, f) => s + f.difficulty, 0) / nonBlank.length).toFixed(2)
  );
}
