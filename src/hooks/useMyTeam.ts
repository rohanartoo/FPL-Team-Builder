import { useState, useMemo, useCallback } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLast5Metrics } from "../utils/player";
import { getNextFixtures } from "../utils/fixtures";
import { calculatePerformanceProfile } from "../utils/metrics";

export const useMyTeam = (
  players: Player[],
  teams: Team[],
  fixtures: Fixture[],
  playerSummaries: Record<number, PlayerSummary>,
  currentGW: number | null,
  tfdrMap: Record<number, any>,
  fetchPlayerSummary: (id: number) => Promise<void>
) => {
  const [myTeamId, setMyTeamId] = useState<string>("");
  const [mySquad, setMySquad] = useState<any[]>([]);
  const [myTeamInfo, setMyTeamInfo] = useState<any>(null);
  const [myTeamLoading, setMyTeamLoading] = useState(false);
  const [myTeamError, setMyTeamError] = useState<string | null>(null);
  const [myTeamHistory, setMyTeamHistory] = useState<any>(null);
  const [numTransfers, setNumTransfers] = useState<number>(3);
  const [expandedTransfers, setExpandedTransfers] = useState<Record<string, boolean>>({});
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<Set<number>>(() => {
    const saved = localStorage.getItem('fpl_excluded_players');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  const toggleExcludePlayer = useCallback((id: number) => {
    setExcludedPlayerIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('fpl_excluded_players', JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const fetchMyTeam = useCallback(async (id: string) => {
    if (!id || !currentGW) return;
    try {
      setMyTeamLoading(true);
      setMyTeamError(null);

      const [entryRes, picksRes, historyRes] = await Promise.all([
        fetch(`/api/fpl/entry/${id}`),
        fetch(`/api/fpl/entry/${id}/event/${currentGW}/picks`),
        fetch(`/api/fpl/entry/${id}/history`)
      ]);

      if (!entryRes.ok) {
        const errorData = await entryRes.json().catch(() => ({ error: "Could not find team. Check your ID." }));
        throw new Error(errorData.error || "Could not find team. Check your ID.");
      }
      if (!picksRes.ok) {
        throw new Error("Could not find picks for this event.");
      }
      if (!historyRes.ok) {
        throw new Error("Could not find history for this team.");
      }

      const entryData = await entryRes.json();
      const picksData = await picksRes.json();
      const historyData = await historyRes.json();

      setMyTeamInfo(entryData);
      setMyTeamHistory(historyData);

      const enrichedSquad = picksData.picks.map((pick: any) => {
        const player = players.find(p => p.id === pick.element);
        if (!player) return pick;

        const summary = playerSummaries[player.id];
        const metrics = calculateLast5Metrics(summary, player.status);
        const nextFixtures = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);
        const fdr = nextFixtures.length > 0
          ? parseFloat((nextFixtures.reduce((s, f) => s + f.difficulty, 0) / nextFixtures.length).toFixed(2))
          : 3;
        const realForm = summary ? metrics.points : parseFloat(player.form);
        const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, player.status, 3, 270, player.element_type) : null;

        const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
        const fallback = perfProfile?.base_pp90 ?? realForm;
        const pp90At = (d: number) => {
          const k = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
          return ({ 2: perfProfile?.pp90_fdr2, 3: perfProfile?.pp90_fdr3, 4: perfProfile?.pp90_fdr4, 5: perfProfile?.pp90_fdr5 }[k] ?? fallback);
        };
        let xPts5GW = 0;
        for (const fix of nextFixtures) {
          if (fix.isBlank) continue;
          xPts5GW += fix.isDouble ? pp90At(fix.difficulty) * 2 : pp90At(fix.difficulty);
        }
        const reliability = hasReliableProfile ? perfProfile!.reliability_score : 1;

        return {
          ...player,
          ...pick,
          fdr,
          realForm,
          valueScore: parseFloat((xPts5GW * reliability).toFixed(2)),
          perfProfile
        };
      });

      setMySquad(enrichedSquad);

      enrichedSquad.forEach((p: any) => {
        if (!playerSummaries[p.id]) fetchPlayerSummary(p.id);
      });

    } catch (err: any) {
      setMyTeamError(err.message);
    } finally {
      setMyTeamLoading(false);
    }
  }, [currentGW, players, teams, fixtures, playerSummaries, tfdrMap, fetchPlayerSummary]);

  const transferSuggestions = useMemo(() => {
    if (!mySquad.length || !players.length) return [];

    const weakLinks = [...mySquad]
      .filter(p => !excludedPlayerIds.has(p.id))
      .sort((a, b) => a.valueScore - b.valueScore)
      .slice(0, numTransfers);

    return weakLinks.map(outPlayer => {
      const budget = outPlayer.now_cost + (myTeamInfo?.last_deadline_bank || 0);

      const betterOptions = players
        .filter(p =>
          p.element_type === outPlayer.element_type &&
          p.id !== outPlayer.id &&
          p.now_cost <= budget &&
          !mySquad.some(s => s.id === p.id) &&
          mySquad.filter(s => s.team === p.team && s.id !== outPlayer.id).length < 3
        )
        .map(p => {
          const summary = playerSummaries[p.id];
          const metrics = calculateLast5Metrics(summary, p.status);
          const nextFix = getNextFixtures(p.team, fixtures, teams, tfdrMap, 5, 0, p.element_type);
          const fdr = nextFix.length > 0
            ? parseFloat((nextFix.reduce((s, f) => s + f.difficulty, 0) / nextFix.length).toFixed(2))
            : 3;
          const realForm = summary ? metrics.points : parseFloat(p.form);
          const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, p.status, 3, 270, p.element_type) : null;

          const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
          const fallback = perfProfile?.base_pp90 ?? realForm;
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

          return {
            ...p,
            fdr,
            realForm,
            valueScore: parseFloat((xPts5GW * reliability).toFixed(2)),
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

      return {
        out: outPlayer,
        options: betterOptions
      };
    });
  }, [mySquad, players, myTeamInfo, playerSummaries, numTransfers, fixtures, teams, tfdrMap, excludedPlayerIds]);

  return {
    myTeamId, setMyTeamId,
    mySquad, setMySquad,
    myTeamInfo, setMyTeamInfo,
    myTeamLoading, setMyTeamLoading,
    myTeamError, setMyTeamError,
    myTeamHistory, setMyTeamHistory,
    numTransfers, setNumTransfers,
    expandedTransfers, setExpandedTransfers,
    excludedPlayerIds, toggleExcludePlayer,
    fetchMyTeam,
    transferSuggestions
  };
};
