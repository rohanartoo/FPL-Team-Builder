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
