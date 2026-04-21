import { Fixture, Team } from "../types";
import { getNextFixtures } from "./fixtures";
import { PositionThresholds } from "./playerThresholds";

export interface PlayerFlags {
  isFTBRun: boolean;
  isHiddenGem: boolean;
  isFormRun: boolean;
  isPriceRise: boolean;
  isBookingRisk: boolean;
  isDueAGoal: boolean;
  isRegressionRisk: boolean;
}

export function getPlayerFlags(
  player: any,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  thresholds: PositionThresholds,
  currentGW: number
): PlayerFlags {
  const upcoming = getNextFixtures(player.team, fixtures, teams, tfdrMap, 3, 0, player.element_type);
  const nonBlank = upcoming.filter(f => !f.isBlank);
  const avg3 = nonBlank.length > 0
    ? nonBlank.reduce((s, f) => s + f.difficulty, 0) / nonBlank.length
    : 3;

  const isFTBRun = player.perfProfile?.archetype === "Flat Track Bully" && avg3 <= 2.5;

  const isHiddenGem =
    parseFloat(player.selected_by_percent) < 5 &&
    player.valueScore >= thresholds.valueTop10[player.element_type];

  const isFormRun =
    player.fplForm >= thresholds.formTop20[player.element_type] &&
    avg3 <= 2.5 &&
    player.perfProfile?.archetype !== "Flat Track Bully";

  const isPriceRise =
    (player.transfers_in_event ?? 0) >= thresholds.transferTop15 &&
    player.valueScore >= thresholds.valueTop30[player.element_type];

  const yellows = player.yellow_cards ?? 0;
  const reds = player.red_cards ?? 0;
  const minsPlayed = player.minutes ?? 0;
  const cardsPer90 = minsPlayed > 0 ? (yellows / (minsPlayed / 90)) : 0;
  const isBookingRisk =
    ((yellows === 4 && currentGW < 19) || (yellows === 9 && currentGW < 32) || (yellows >= 5 && reds >= 2)) ||
    (minsPlayed >= 270 && cardsPer90 >= 0.3);

  const isMidOrFwd = player.element_type === 3 || player.element_type === 4;
  const xG = parseFloat(player.expected_goals ?? '0');
  const xGper90 = player.expected_goals_per_90 ?? 0;
  const actualGoals = player.goals_scored ?? 0;

  const isDueAGoal =
    isMidOrFwd &&
    minsPlayed >= 450 &&
    xGper90 >= 0.25 &&
    actualGoals < xG * 0.55;

  const isRegressionRisk =
    isMidOrFwd &&
    minsPlayed >= 450 &&
    xG >= 2.0 &&
    actualGoals > xG * 1.8;

  return { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk };
}
