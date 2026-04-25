// FPL yellow card suspension thresholds
export const YELLOW_WARNING_1 = 4;
export const YELLOW_WARNING_2 = 9;
export const YELLOW_SUSPENSION = 14;
// GW before which each warning resets (cards clear at GW19 and GW32)
export const YELLOW_GW_CUTOFF_1 = 19;
export const YELLOW_GW_CUTOFF_2 = 32;
export const BOOKING_CARDS_PER_90 = 0.3;
export const BOOKING_MIN_MINS = 270;

// xG per 90 threshold for forward-looking signals — position-adjusted
export const XG_THRESHOLD_FWD = 0.25;
export const XG_THRESHOLD_MID = 0.15;
export const DUE_A_GOAL_MIN_MINS = 450;
// Goals below this fraction of xG = underperforming (Due a Goal)
export const DUE_A_GOAL_UNDERPERFORM_RATIO = 0.55;

// Goals above this multiple of xG = regression risk
export const REGRESSION_MIN_XG = 2.0;
export const REGRESSION_OVERPERFORM_RATIO = 1.8;

// Hidden Gem price caps (FPL now_cost units = £ × 10): GKP ≤ £5.5m, DEF ≤ £6.0m, MID/FWD ≤ £7.0m
export const HIDDEN_GEM_PRICE_CAPS: Record<number, number> = { 1: 55, 2: 60, 3: 70, 4: 70 };

// Clean sheet model — PL average goals conceded per 90
export const LEAGUE_AVG_XGC90 = 1.15;
