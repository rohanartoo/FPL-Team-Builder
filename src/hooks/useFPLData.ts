import { useEffect, useState, useMemo, useRef } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLiveStandings, calculateLiveForm, calculateTFDR } from "../utils/metrics";

export const useFPLData = () => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [currentGW, setCurrentGW] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState({ loaded: 0, total: 0 });
  const [apiError, setApiError] = useState<string | null>(null);
  const [playerSummaries, setPlayerSummaries] = useState<Record<number, PlayerSummary>>({});
  const [isSyncing, setIsSyncing] = useState(false);
  const fetchedIdsRef = useRef<Set<number>>(new Set());

  const tfdrMap = useMemo(() => {
    if (!fixtures.length || !teams.length) return {};
    const standings = calculateLiveStandings(fixtures);
    const map: Record<number, any> = {};
    teams.forEach(t => {
      const st = standings[t.id] || { 
        position: 10,
        rank_attack_home: 10, rank_attack_away: 10, rank_attack_overall: 10, 
        rank_defense_home: 10, rank_defense_away: 10, rank_defense_overall: 10 
      };

      const formHome = calculateLiveForm(t.id, fixtures, 'home');
      const formAway = calculateLiveForm(t.id, fixtures, 'away');

      map[t.id] = {
        home: {
          defense_fdr: calculateTFDR(t.strength, st.rank_attack_home, formHome),
          attack_fdr: calculateTFDR(t.strength, st.rank_defense_home, formHome),
          overall: calculateTFDR(t.strength, st.position, formHome)
        },
        away: {
          defense_fdr: calculateTFDR(t.strength, st.rank_attack_away, formAway),
          attack_fdr: calculateTFDR(t.strength, st.rank_defense_away, formAway),
          overall: calculateTFDR(t.strength, st.position, formAway)
        }
      };
    });
    return map;
  }, [fixtures, teams]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setApiError(null);
        const [bootstrapRes, fixturesRes, summariesRes] = await Promise.all([
          fetch("/api/fpl/bootstrap"),
          fetch("/api/fpl/fixtures"),
          fetch("/api/fpl/all-summaries")
        ]);

        if (!bootstrapRes.ok || !fixturesRes.ok) {
          throw new Error("The FPL API is currently down or being updated. Please try again later.");
        }

        const bootstrapData = await bootstrapRes.json();
        const fixturesData = await fixturesRes.json();
        const summariesData = await summariesRes.json();

        if (bootstrapData.error || !bootstrapData.elements) {
          throw new Error("Received invalid data from FPL API (Game might be updating).");
        }

        setPlayers(bootstrapData.elements || []);
        setTeams(bootstrapData.teams || []);
        setFixtures(Array.isArray(fixturesData) ? fixturesData : []);
        
        if (summariesData && summariesData.summaries) {
          setPlayerSummaries(summariesData.summaries);
          setIsSyncing(summariesData.isSyncing);
          if (summariesData.isSyncing) {
            setSyncProgress(summariesData.progress);
            if (Object.keys(summariesData.summaries).length > 0) {
              setLoading(false);
            }
          } else {
            setLoading(false);
          }
        } else {
          setLoading(false);
        }

        const activeGW = bootstrapData.events?.find((e: any) => e.is_current)?.id ||
          bootstrapData.events?.find((e: any) => e.is_next)?.id;
        setCurrentGW(activeGW);
      } catch (error: any) {
        console.error("Error fetching FPL data:", error);
        setApiError(error.message || "An unexpected error occurred connecting to FPL.");
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    let interval: any;
    if (loading || isSyncing) {
      interval = setInterval(async () => {
        try {
          const res = await fetch("/api/fpl/all-summaries");
          if (res.ok) {
            const data = await res.json();
            setIsSyncing(data.isSyncing);
            if (data.summaries && Object.keys(data.summaries).length > 0) {
              setPlayerSummaries(data.summaries);
              setLoading(false);
            }
            if (!data.isSyncing) {
              setLoading(false);
              clearInterval(interval);
            }
          }
        } catch (e) {
          console.error("Failed to poll sync progress", e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [loading, isSyncing]);

  const fetchPlayerSummary = async (playerId: number) => {
    if (playerSummaries[playerId]) return;
    try {
      const res = await fetch(`/api/fpl/player-summary/${playerId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && Array.isArray(data.history)) {
        setPlayerSummaries(prev => ({ ...prev, [playerId]: data }));
      }
    } catch (error) {
      console.error(`Error fetching summary for player ${playerId}:`, error);
    }
  };

  return {
    players,
    teams,
    fixtures,
    currentGW,
    loading,
    syncProgress,
    apiError,
    playerSummaries,
    setPlayerSummaries,
    isSyncing,
    tfdrMap,
    fetchPlayerSummary,
    fetchedIdsRef
  };
};
