import { PlayerSummary } from "../types";

export const calculateEaseForMath = (fdr: number) => {
  return parseFloat((5 - fdr).toFixed(2));
};

export const calculateLast5Metrics = (summary: PlayerSummary | undefined) => {
  if (!summary || summary.history.length === 0) return {
    points: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    bonus: 0
  };
  
  const last5 = (summary.history || []).slice(-5);
  return {
    points: parseFloat((last5.reduce((sum, h) => sum + h.total_points, 0) / last5.length).toFixed(2)),
    goals: last5.reduce((sum, h) => sum + h.goals_scored, 0),
    assists: last5.reduce((sum, h) => sum + h.assists, 0),
    cleanSheets: last5.reduce((sum, h) => sum + h.clean_sheets, 0),
    bonus: last5.reduce((sum, h) => sum + h.bonus, 0)
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
