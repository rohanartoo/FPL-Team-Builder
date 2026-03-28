import { useState, useMemo, useCallback } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics, isLongTermInjured } from "../utils/player";
import { getNextFixtures } from "../utils/fixtures";
import { calculatePerformanceProfile, blendPerformanceWithPrior, SeasonPriors } from "../utils/metrics";

export const useH2H = (
  players: Player[],
  teams: Team[],
  fixtures: Fixture[],
  playerSummaries: Record<number, PlayerSummary>,
  currentGW: number | null,
  tfdrMap: Record<number, any>,
  fetchPlayerSummary: (id: number) => Promise<void>,
  mySquad: any[],
  myTeamInfo: any,
  numTransfers: number,
  seasonPriors: SeasonPriors | null
) => {
  const [opponentTeamId, setOpponentTeamId] = useState<string>("");
  const [opponentSquad, setOpponentSquad] = useState<any[]>([]);
  const [opponentTeamInfo, setOpponentTeamInfo] = useState<any>(null);
  const [opponentLoading, setOpponentLoading] = useState(false);
  const [opponentError, setOpponentError] = useState<string | null>(null);
  const [opponentTeamHistory, setOpponentTeamHistory] = useState<any>(null);

  const fetchTeamData = useCallback(async (id: string, isOpponent: boolean) => {
    if (!id || !currentGW) return;
    try {
      const [entryRes, picksRes, historyRes] = await Promise.all([
        fetch(`/api/fpl/entry/${id}`),
        fetch(`/api/fpl/entry/${id}/event/${currentGW}/picks`),
        fetch(`/api/fpl/entry/${id}/history`)
      ]);

      if (!entryRes.ok || !picksRes.ok || !historyRes.ok) {
        throw new Error(`Could not find team ${id}.`);
      }

      const entryData = await entryRes.json();
      const picksData = await picksRes.json();
      const historyData = await historyRes.json();

      if (isOpponent) {
        setOpponentTeamInfo(entryData);
        setOpponentTeamHistory(historyData);
      }

      const enrichedSquad = picksData.picks.map((pick: any) => {
        const player = players.find(p => p.id === pick.element);
        if (!player) return pick;
        const summary = playerSummaries[player.id];
        const metrics = calculateLast5Metrics(summary, player.status);
        const nextFix = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);
        const fdr = nextFix.length > 0
          ? parseFloat((nextFix.reduce((s, f) => s + f.difficulty, 0) / nextFix.length).toFixed(2))
          : 3;
        const realForm = summary ? metrics.points : parseFloat(player.form);
        let perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type) : null;

        // Blend with prior-season data
        if (perfProfile && seasonPriors?.players?.[player.id]) {
          perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[player.id], player.team);
        }

        const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
        // Last-resort fallback: use price as PP90 proxy when no form/performance data exists (pre-GW1)
        const priceEstimate = player.now_cost / 20;
        const fallback = perfProfile?.base_pp90 ?? (realForm || priceEstimate);
        const pp90At = (d: number) => {
          const k = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
          return ({ 2: perfProfile?.pp90_fdr2, 3: perfProfile?.pp90_fdr3, 4: perfProfile?.pp90_fdr4, 5: perfProfile?.pp90_fdr5 }[k] ?? fallback);
        };
        let xPts5GW = 0;
        for (const fix of nextFix) {
          if (fix.isBlank) continue;
          xPts5GW += fix.isDouble ? pp90At(fix.difficulty) * 2 : pp90At(fix.difficulty);
        }
        const reliability = hasReliableProfile ? perfProfile!.reliability_score : 1;
        const availabilityMultiplier = isLongTermInjured(player) ? 0 : 1;

        // Basement Floor: 25% weight on season-long PPG (falls back to price estimate pre-season)
        const seasonPPG = parseFloat(player.points_per_game) || priceEstimate;
        const basementFloor = seasonPPG * 5; // Theoretical floor over 5 games

        // Weighted Score: 75% short-term xPts (fixture-adjusted), 25% long-term floor
        const weightedScore = (xPts5GW * 0.75) + (basementFloor * 0.25);

        return {
          ...player,
          ...pick,
          fdr,
          realForm,
          valueScore: parseFloat((weightedScore * reliability * availabilityMultiplier).toFixed(2)),
          perfProfile
        };
      });

      if (isOpponent) setOpponentSquad(enrichedSquad);
      
      enrichedSquad.forEach((p: any) => {
        if (!playerSummaries[p.id]) fetchPlayerSummary(p.id);
      });

      return { entryData, enrichedSquad, historyData };
    } catch (err: any) {
      throw err;
    }
  }, [currentGW, players, teams, fixtures, playerSummaries, tfdrMap, fetchPlayerSummary, seasonPriors]);

  const h2hData = useMemo(() => {
    if (!mySquad.length || !opponentSquad.length) return null;

    const common = mySquad.filter(p => opponentSquad.some(op => op.id === p.id)).sort((a, b) => b.valueScore - a.valueScore);
    const myDiff = mySquad.filter(p => !opponentSquad.some(op => op.id === p.id)).sort((a, b) => b.valueScore - a.valueScore);
    const oppDiff = opponentSquad.filter(p => !mySquad.some(op => op.id === p.id)).sort((a, b) => b.valueScore - a.valueScore);

    const weakLinks = [...myDiff].sort((a, b) => a.valueScore - b.valueScore).slice(0, numTransfers);

    const suggestions = weakLinks.map(outPlayer => {
      const budget = outPlayer.now_cost + (myTeamInfo?.last_deadline_bank || 0);
      const betterOptions = players
        .filter(p =>
          p.element_type === outPlayer.element_type &&
          p.id !== outPlayer.id &&
          p.now_cost <= budget &&
          !mySquad.some(s => s.id === p.id) &&
          !opponentSquad.some(op => op.id === p.id) &&
          mySquad.filter(s => s.team === p.team && s.id !== outPlayer.id).length < 3
        )
        .map(p => {
          const summary = playerSummaries[p.id];
          const metrics = calculateLast5Metrics(summary, p.status);
          const nextFix2 = getNextFixtures(p.team, fixtures, teams, tfdrMap, 5, 0, p.element_type);
          const fdr = nextFix2.length > 0
            ? parseFloat((nextFix2.reduce((s, f) => s + f.difficulty, 0) / nextFix2.length).toFixed(2))
            : 3;
          const realForm = summary ? metrics.points : parseFloat(p.form);
          let perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, p.status, 3, 270, p.element_type) : null;

          // Blend with prior-season data
          if (perfProfile && seasonPriors?.players?.[p.id]) {
            perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[p.id], p.team);
          }

          const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);
          // Last-resort fallback: use price as PP90 proxy when no form/performance data exists (pre-GW1)
          const priceEstimate = p.now_cost / 20;
          const fallback = perfProfile?.base_pp90 ?? (realForm || priceEstimate);
          const pp90At = (d: number) => {
            const k = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
            return ({ 2: perfProfile?.pp90_fdr2, 3: perfProfile?.pp90_fdr3, 4: perfProfile?.pp90_fdr4, 5: perfProfile?.pp90_fdr5 }[k] ?? fallback);
          };
          let xPts5GW = 0;
          for (const fix of nextFix2) {
            if (fix.isBlank) continue;
            xPts5GW += fix.isDouble ? pp90At(fix.difficulty) * 2 : pp90At(fix.difficulty);
          }
          const reliability = hasReliableProfile ? perfProfile!.reliability_score : 1;
          const availabilityMultiplier = isLongTermInjured(p) ? 0 : 1;

          // Basement Floor: 25% weight on season-long PPG (falls back to price estimate pre-season)
          const seasonPPG = parseFloat(p.points_per_game) || priceEstimate;
          const basementFloor = seasonPPG * 5; // Theoretical floor over 5 games

          // Weighted Score: 75% short-term xPts (fixture-adjusted), 25% long-term floor
          const weightedScore = (xPts5GW * 0.75) + (basementFloor * 0.25);

          return {
            ...p,
            fdr,
            realForm,
            valueScore: parseFloat((weightedScore * reliability * availabilityMultiplier).toFixed(2)),
            perfProfile
          };
        })
        .filter(p => {
          if (!p.perfProfile || p.perfProfile.appearances < 3) return true;
          return p.perfProfile.reliability_score >= 0.2;
        })
        .filter(p => p.valueScore > outPlayer.valueScore)
        .sort((a, b) => b.valueScore - a.valueScore)
        .slice(0, 6);

      return { out: outPlayer, options: betterOptions };
    });

    return { common, myDiff, oppDiff, suggestions };
  }, [mySquad, opponentSquad, players, myTeamInfo, playerSummaries, numTransfers, fixtures, teams, tfdrMap, seasonPriors]);

  return {
    opponentTeamId, setOpponentTeamId,
    opponentSquad, setOpponentSquad,
    opponentTeamInfo, setOpponentTeamInfo,
    opponentLoading, setOpponentLoading,
    opponentError, setOpponentError,
    opponentTeamHistory, setOpponentTeamHistory,
    fetchTeamData,
    h2hData
  };
};
