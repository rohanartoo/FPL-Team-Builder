import { PlayerSummary } from "../types";
import { detectExcusedMatches } from "./metrics";

export const calculateEaseForMath = (fdr: number) => {
  return parseFloat((5 - fdr).toFixed(2));
};

export const calculateLast5Metrics = (summary: PlayerSummary | undefined, playerStatus?: string) => {
  if (!summary || summary.history.length === 0) return {
    points: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    bonus: 0,
    ppa: 0,
    isPPAAdjusted: false
  };
  
  const history = summary.history || [];
  const last5 = history.slice(-5);
  const totalPoints = last5.reduce((sum, h) => sum + h.total_points, 0);
  
  // Detect excused matches within the full history, then filter for the last 5
  const excusedSet = detectExcusedMatches(history, playerStatus);
  const startIndex = Math.max(0, history.length - 5);
  
  let validGamesCount = 0;
  let playedGamesCount = 0;
  
  for (let i = startIndex; i < history.length; i++) {
    const isExcused = excusedSet.has(i);
    const played = history[i].minutes > 0;
    
    if (played) playedGamesCount++;
    
    // A game is "valid" for the PPG divisor if it wasn't excused
    if (!isExcused) {
      validGamesCount++;
    }
  }
  
  // If a player is healthy ('a') and had an excused absence, we use the fairer divisor
  // We apply a "Floor Divisor" of 3 to prevent small-sample boosters (e.g., one-match wonders).
  const divisor = Math.max(3, validGamesCount);
  const ppaDivisor = Math.max(1, playedGamesCount);

  return {
    points: parseFloat((totalPoints / divisor).toFixed(2)),
    goals: last5.reduce((sum, h) => sum + h.goals_scored, 0),
    assists: last5.reduce((sum, h) => sum + h.assists, 0),
    cleanSheets: last5.reduce((sum, h) => sum + h.clean_sheets, 0),
    bonus: last5.reduce((sum, h) => sum + h.bonus, 0),
    ppa: parseFloat((totalPoints / ppaDivisor).toFixed(2)),
    isPPAAdjusted: divisor < 5 && playerStatus === 'a'
  };
};

/**
 * Returns a multiplier (0.0 to 1.0) based on a player's injury/availability status.
 * Projects over a 5-gameweek horizon. If a player is out for 14 days, they miss ~2 GWs,
 * so their multiplier is roughly 0.6 (3/5).
 */
export function getAvailabilityMultiplier(player: { status: string; chance_of_playing_next_round: number | null; news: string }): number {
  if (player.status === 'a' || player.status === 'None') return 1;

  const chance = player.chance_of_playing_next_round;
  const news = (player.news || "").toLowerCase();

  // Explicitly ruled out for a long time
  if (news.includes('season') || news.includes('surgery') || news.includes('months') ||
      news.includes('year') || news.includes('no return date')) {
    return 0;
  }

  const dateRegex = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
  const match = news.match(dateRegex);

  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = parseInt(match[1]);
    const month = months.indexOf(match[2].toLowerCase());
    const now = new Date();
    const returnDate = new Date(now.getFullYear(), month, day);
    
    // If the date parsed is in the past by >30 days, it probably meant next year
    if (returnDate < now && (now.getTime() - returnDate.getTime()) > 86400000 * 30) {
      returnDate.setFullYear(now.getFullYear() + 1);
    }
    
    const daysOut = (returnDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    
    // We are projecting 5 gameweeks into the future (approx 35 days).
    if (daysOut >= 35) return 0;
    if (daysOut <= 0) return chance !== null ? chance / 100 : 1;
    
    // Linearly scale based on days out. Roughly 7 days per gameweek.
    const gwMissed = Math.min(5, Math.ceil(daysOut / 7));
    return (5 - gwMissed) / 5;
  }

  // If no date, use FPL's chance_of_playing_next_round for a short-term 5-GW ding
  if (chance === 0) return 0.6;   // Usually out 1-2 games
  if (chance === 25) return 0.8;  // Heavy doubt
  if (chance === 50) return 0.85; // Coin toss
  if (chance === 75) return 0.95; // Minor knock

  // If status is 's' (suspended) but no chance metric provided (rare but possible)
  if (player.status === 's') return 0.6; 

  return 0.8; // fallback
}

export const getFDRColor = (difficulty: number) => {
  const rounded = Math.round(Math.max(1, Math.min(5, difficulty)));
  switch (rounded) {
    case 1: return "bg-emerald-500/20 border-emerald-500/40";
    case 2: return "bg-emerald-500/10 border-emerald-500/20";
    case 3: return "bg-[#141414]/5 border-[#141414]/20";
    case 4: return "bg-rose-500/10 border-rose-500/20";
    case 5: return "bg-rose-500/20 border-rose-500/40";
    default: return "bg-[#141414]/5 border-[#141414]/20";
  }
};

export function isLongTermInjured(player: { status: string; chance_of_playing_next_round: number | null; news: string }): boolean {
  return getAvailabilityMultiplier(player) === 0;
}
