import { useState, useMemo, useCallback } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics, calculateEaseForMath } from "../utils/player";
import { calculateFDR } from "../utils/fixtures";
import { calculatePerformanceProfile } from "../utils/metrics";

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
  numTransfers: number
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
        const metrics = calculateLast5Metrics(summary);
        const fdr = calculateFDR(player.team, fixtures, teams, tfdrMap, player.element_type);
        const fixtureEase = calculateEaseForMath(fdr);
        const realForm = summary ? metrics.points : parseFloat(player.form);
        const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type) : null;

        const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
        const baseVal = hasReliableProfile
          ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
          : realForm;

        return {
          ...player,
          ...pick,
          fdr,
          fixtureEase,
          realForm,
          valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
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
  }, [currentGW, players, teams, fixtures, playerSummaries, tfdrMap, fetchPlayerSummary]);

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
          const metrics = calculateLast5Metrics(summary);
          const fdr = calculateFDR(p.team, fixtures, teams, tfdrMap, p.element_type);
          const fixtureEase = calculateEaseForMath(fdr);
          const realForm = summary ? metrics.points : parseFloat(p.form);
          const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, p.status, 3, 270, p.element_type) : null;

          const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
          const baseVal = hasReliableProfile
            ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
            : realForm;

          return {
            ...p,
            fdr,
            fixtureEase,
            realForm,
            valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
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
  }, [mySquad, opponentSquad, players, myTeamInfo, playerSummaries, numTransfers, fixtures, teams, tfdrMap]);

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
