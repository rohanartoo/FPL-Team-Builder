import { Fixture, Team } from "../types";
import { getNextFixtures } from "./fixtures";
import { PositionThresholds } from "./playerThresholds";
import {
  HIDDEN_GEM_PRICE_CAPS,
  YELLOW_WARNING_1, YELLOW_WARNING_2, YELLOW_SUSPENSION,
  YELLOW_GW_CUTOFF_1, YELLOW_GW_CUTOFF_2,
  BOOKING_CARDS_PER_90, BOOKING_MIN_MINS,
  XG_THRESHOLD_FWD, XG_THRESHOLD_MID,
  DUE_A_GOAL_MIN_MINS, DUE_A_GOAL_UNDERPERFORM_RATIO,
  REGRESSION_MIN_XG, REGRESSION_OVERPERFORM_RATIO,
} from "./constants";

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
    player.valueScore >= thresholds.valueTop10[player.element_type] &&
    (player.now_cost ?? 999) <= (HIDDEN_GEM_PRICE_CAPS[player.element_type] ?? 70);

  const isFormRun =
    player.fplForm >= thresholds.formTop20[player.element_type] &&
    avg3 <= 2.5 &&
    player.perfProfile?.archetype !== "Flat Track Bully";

  const isPriceRise =
    (player.transfers_in_event ?? 0) >= thresholds.transferTop15 &&
    player.valueScore >= thresholds.valueTop30[player.element_type];

  const yellows = player.yellow_cards ?? 0;
  const minsPlayed = player.minutes ?? 0;
  const cardsPer90 = minsPlayed > 0 ? (yellows / (minsPlayed / 90)) : 0;
  const isBookingRisk =
    (yellows === YELLOW_WARNING_1 && currentGW < YELLOW_GW_CUTOFF_1) ||
    (yellows === YELLOW_WARNING_2 && currentGW < YELLOW_GW_CUTOFF_2) ||
    yellows === YELLOW_SUSPENSION ||
    (minsPlayed >= BOOKING_MIN_MINS && cardsPer90 >= BOOKING_CARDS_PER_90);

  const isMidOrFwd = player.element_type === 3 || player.element_type === 4;
  const xG = parseFloat(player.expected_goals ?? '0');
  const xGper90 = player.expected_goals_per_90 ?? 0;
  const actualGoals = player.goals_scored ?? 0;
  const xGthreshold = player.element_type === 4 ? XG_THRESHOLD_FWD : XG_THRESHOLD_MID;

  const isDueAGoal =
    isMidOrFwd &&
    minsPlayed >= DUE_A_GOAL_MIN_MINS &&
    xGper90 >= xGthreshold &&
    actualGoals < xG * DUE_A_GOAL_UNDERPERFORM_RATIO;

  const isRegressionRisk =
    isMidOrFwd &&
    minsPlayed >= DUE_A_GOAL_MIN_MINS &&
    xG >= REGRESSION_MIN_XG &&
    actualGoals > xG * REGRESSION_OVERPERFORM_RATIO;

  return { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk };
}
