import { useEffect, useState, useMemo, useRef } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../types";
import { calculateLiveStandings, calculateAttackForm, calculateDefenseForm, calculateRawTFDR, normalizeTFDRMap, SeasonPriors } from "../utils/metrics";

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
  const [seasonPriors, setSeasonPriors] = useState<SeasonPriors | null>(null);

  // Early season detection: used for UI banner
  const finishedFixtureCount = useMemo(() => fixtures.filter(f => f.finished).length, [fixtures]);
  const isEarlySeason = finishedFixtureCount < 30;

  // TFDR blending thresholds (in finished fixtures)
  // Below BLEND_START: live standings are pure noise, use prior only
  // BLEND_START to BLEND_END: linearly blend prior → live
  // Above BLEND_END: prior fully decayed, live TFDR only
  const TFDR_BLEND_START = 10;  // ~GW1 complete
  const TFDR_BLEND_END = 80;    // ~GW8 complete

  const tfdrMap = useMemo(() => {
    if (!fixtures.length || !teams.length) return {};

    const hasPrior = !!seasonPriors?.tfdrMap;

    // Too few fixtures for any live signal — use prior or fall back to native FDR
    if (finishedFixtureCount < TFDR_BLEND_START) {
      return hasPrior ? { ...seasonPriors.tfdrMap } : {};
    }

    // Calculate live TFDR map
    const standings = calculateLiveStandings(fixtures);
    const liveMap: Record<number, any> = {};
    teams.forEach(t => {
      const st = standings[t.id] || {
        position: 10,
        rank_attack_home: 10, rank_attack_away: 10, rank_attack_overall: 10,
        rank_defense_home: 10, rank_defense_away: 10, rank_defense_overall: 10
      };

      const attackFormHome = calculateAttackForm(t.id, fixtures, 'home');
      const defenseFormHome = calculateDefenseForm(t.id, fixtures, 'home');
      const attackFormAway = calculateAttackForm(t.id, fixtures, 'away');
      const defenseFormAway = calculateDefenseForm(t.id, fixtures, 'away');

      liveMap[t.id] = {
        home: {
          defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_home, attackFormHome),
          attack_fdr:  calculateRawTFDR(t.strength, st.rank_defense_home, defenseFormHome, true),
          overall:     calculateRawTFDR(t.strength, st.position, attackFormHome)
        },
        away: {
          defense_fdr: calculateRawTFDR(t.strength, st.rank_attack_away, attackFormAway),
          attack_fdr:  calculateRawTFDR(t.strength, st.rank_defense_away, defenseFormAway, true),
          overall:     calculateRawTFDR(t.strength, st.position, attackFormAway)
        }
      };
    });
    normalizeTFDRMap(liveMap);

    // No prior to blend with, or past the blend window — use live directly
    if (!hasPrior || finishedFixtureCount >= TFDR_BLEND_END) {
      return liveMap;
    }

    // Gradual blend: prior weight decays linearly across the window
    const priorWeight = Math.max(0, 1 - (finishedFixtureCount - TFDR_BLEND_START) / (TFDR_BLEND_END - TFDR_BLEND_START));
    const liveWeight = 1 - priorWeight;
    const blendedMap: Record<number, any> = {};
    const contexts = ['home', 'away'] as const;
    const keys = ['defense_fdr', 'attack_fdr', 'overall'] as const;

    for (const teamId of Object.keys(liveMap).map(Number)) {
      const live = liveMap[teamId];
      const prior = seasonPriors!.tfdrMap[teamId];

      if (!prior) {
        // Promoted team — no prior data, use live only
        blendedMap[teamId] = live;
      } else {
        blendedMap[teamId] = { home: {} as any, away: {} as any };
        for (const ctx of contexts) {
          for (const key of keys) {
            blendedMap[teamId][ctx][key] = parseFloat(
              (live[ctx][key] * liveWeight + prior[ctx][key] * priorWeight).toFixed(2)
            );
          }
        }
      }
    }

    return blendedMap;
  }, [fixtures, teams, finishedFixtureCount, seasonPriors]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setApiError(null);
        const [bootstrapRes, fixturesRes, summariesRes, priorsRes] = await Promise.all([
          fetch("/api/fpl/bootstrap"),
          fetch("/api/fpl/fixtures"),
          fetch("/api/fpl/all-summaries"),
          fetch("/api/fpl/season-priors")
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

        // Load season priors if available
        if (priorsRes.ok) {
          const priorsData = await priorsRes.json();
          if (priorsData && priorsData.players) {
            setSeasonPriors(priorsData);
            console.log(`Loaded season priors: ${priorsData.season}, ${Object.keys(priorsData.players).length} players`);
          }
        }
        
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
    fetchedIdsRef,
    isEarlySeason,
    seasonPriors
  };
};
