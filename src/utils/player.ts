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
 * Returns true if a player is effectively unavailable for the foreseeable future
 * (long-term injury with no near-term return date). Used to zero out value scores
 * so injured players don't pollute transfer suggestions or rankings.
 */
export function isLongTermInjured(player: { status: string; chance_of_playing_next_round: number | null; news: string }): boolean {
  if (player.status !== 'i') return false;
  if (player.chance_of_playing_next_round !== 0 && player.chance_of_playing_next_round !== null) return false;

  const news = player.news.toLowerCase();
  const dateRegex = /(\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
  const match = player.news.match(dateRegex);

  if (match) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const day = parseInt(match[1]);
    const month = months.indexOf(match[2].toLowerCase());
    const now = new Date();
    const returnDate = new Date(now.getFullYear(), month, day);
    if (returnDate < now && (now.getTime() - returnDate.getTime()) > 86400000 * 30) {
      returnDate.setFullYear(now.getFullYear() + 1);
    }
    const daysOut = (returnDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysOut > 35;
  }

  // No return date — check for long-term keywords or explicit uncertainty
  return news.includes('season') || news.includes('surgery') || news.includes('months') ||
    news.includes('year') || news.includes('unknown') || news.includes('no return date') ||
    news.includes('tbc');
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
