import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { 
  Trophy, 
  Shield, 
  Zap, 
  Target, 
  TrendingUp, 
  Calendar, 
  Filter,
  ChevronRight,
  ChevronDown,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart2,
  LayoutGrid,
  Info,
  Swords
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  ZAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  Label
} from "recharts";
import { Player, Team, Fixture, POSITION_MAP, PlayerSummary } from "./types";
import { calculatePerformanceProfile, calculateLiveStandings, calculateLiveForm, calculateTFDR } from "./utils/metrics";

const POSITION_ICONS: Record<number, any> = {
  1: Shield,
  2: Shield,
  3: Zap,
  4: Target,
};

const POSITION_COLORS: Record<number, string> = {
  1: "text-yellow-500",
  2: "text-blue-500",
  3: "text-emerald-500",
  4: "text-rose-500",
};

const CHART_COLORS: Record<number, string> = {
  1: "#EAB308", // Yellow
  2: "#3B82F6", // Blue
  3: "#10B981", // Emerald
  4: "#F43F5E", // Rose
};

export default function App() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [currentGW, setCurrentGW] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [playerSummaries, setPlayerSummaries] = useState<Record<number, PlayerSummary>>({});
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "viz" | "schedule" | "team" | "h2h" | "performance">("list");
  const [isFetchingSummaries, setIsFetchingSummaries] = useState(false);
  // Track which player IDs have already been queued for fetching to avoid duplicates
  const fetchedIdsRef = useRef<Set<number>>(new Set());
  const [myTeamId, setMyTeamId] = useState<string>("");
  const [mySquad, setMySquad] = useState<any[]>([]);
  const [myTeamInfo, setMyTeamInfo] = useState<any>(null);
  const [myTeamLoading, setMyTeamLoading] = useState(false);
  const [myTeamError, setMyTeamError] = useState<string | null>(null);
  const [myTeamHistory, setMyTeamHistory] = useState<any>(null);
  
  const [opponentTeamId, setOpponentTeamId] = useState<string>("");
  const [opponentSquad, setOpponentSquad] = useState<any[]>([]);
  const [opponentTeamInfo, setOpponentTeamInfo] = useState<any>(null);
  const [opponentLoading, setOpponentLoading] = useState(false);
  const [opponentError, setOpponentError] = useState<string | null>(null);
  const [opponentTeamHistory, setOpponentTeamHistory] = useState<any>(null);

  const [numTransfers, setNumTransfers] = useState<number>(3);
  const [expandedTransfers, setExpandedTransfers] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'realForm',
    direction: 'desc'
  });

  const tfdrMap = useMemo(() => {
    if (!fixtures.length || !teams.length) return {};
    const standings = calculateLiveStandings(fixtures);
    const map: Record<number, { home: number; away: number; overall: number }> = {};
    teams.forEach(t => {
      const pos = standings[t.id]?.position || 10;
      map[t.id] = {
        home: calculateTFDR(t.strength, pos, calculateLiveForm(t.id, fixtures, 'home')),
        away: calculateTFDR(t.strength, pos, calculateLiveForm(t.id, fixtures, 'away')),
        overall: calculateTFDR(t.strength, pos, calculateLiveForm(t.id, fixtures, 'overall'))
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
        }
        
        // Find current or next Gameweek
        const activeGW = bootstrapData.events?.find((e: any) => e.is_current)?.id || 
                         bootstrapData.events?.find((e: any) => e.is_next)?.id;
        setCurrentGW(activeGW);
      } catch (error: any) {
        console.error("Error fetching FPL data:", error);
        setApiError(error.message || "An unexpected error occurred connecting to FPL.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const getTeamName = (id: number) => teams.find(t => t.id === id)?.name || "Unknown";
  const getTeamShortName = (id: number) => teams.find(t => t.id === id)?.short_name || "UNK";

  const getNextFixtures = (teamId: number, count: number = 5, offset: number = 0) => {
    if (!fixtures.length) return [];
    
    // Find unique upcoming specified gameweeks (ignoring finished ones and null events like unscheduled games)
    const upcomingEvents = Array.from(new Set(
      fixtures.filter(f => !f.finished && f.event).map(f => f.event)
    )).sort((a: any, b: any) => a - b);
    
    const targetEvents = upcomingEvents.slice(offset, offset + count);
    const result = [];
    
    for (const gw of targetEvents) {
      const gwFixtures = fixtures.filter(f => f.event === gw && (f.team_h === teamId || f.team_a === teamId));
      
      if (gwFixtures.length === 0) {
        result.push({
          opponent: "BLA",
          difficulty: 5, // Blank is max difficulty (no points possible)
          isHome: false,
          event: gw,
          isBlank: true
        });
      } else {
        // Handle double gameweeks by showing one but indicating the double with a '+'
        const f = gwFixtures[0];
        const isHome = f.team_h === teamId;
        const opponentId = isHome ? f.team_a : f.team_h;
        // Use TFDR if available, otherwise fallback to static FPL FDR
        // Our player plays at home => Opponent plays away (so we pull their Away TFDR)
        const oppContext = isHome ? 'away' : 'home';
        const difficulty = tfdrMap[opponentId]?.[oppContext] || (isHome ? f.team_h_difficulty : f.team_a_difficulty);
        
        result.push({
          opponent: gwFixtures.length > 1 ? `${getTeamShortName(opponentId)}+` : getTeamShortName(opponentId),
          difficulty,
          isHome,
          event: gw,
          isBlank: false,
          isDouble: gwFixtures.length > 1
        });
      }
    }
    
    return result;
  };

  const calculateAvgDifficulty = (teamId: number, count: number = 5, offset: number = 0) => {
    const upcoming = getNextFixtures(teamId, count, offset);
    if (upcoming.length === 0) return 0;
    
    // We count blanks as FDR 5 in the average to penalize players not playing
    return parseFloat((upcoming.reduce((sum, f) => sum + f.difficulty, 0) / upcoming.length).toFixed(2));
  };

  const calculateFixtureEase = (teamId: number) => {
    const avgDifficulty = calculateAvgDifficulty(teamId, 5);
    return parseFloat((5 - avgDifficulty).toFixed(2));
  };

  const calculateLast5Metrics = (playerId: number) => {
    const summary = playerSummaries[playerId];
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

  const fetchPlayerSummary = async (playerId: number) => {
    if (playerSummaries[playerId]) return;
    try {
      const res = await fetch(`/api/fpl/player-summary/${playerId}`);
      if (!res.ok) return; // silently ignore server-side errors (e.g. game updating)
      const data = await res.json();
      // Only store if we received a valid summary with a history array
      if (data && Array.isArray(data.history)) {
        setPlayerSummaries(prev => ({ ...prev, [playerId]: data }));
      }
    } catch (error) {
      console.error(`Error fetching summary for player ${playerId}:`, error);
    }
  };

  const fetchMyTeam = async (id: string) => {
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
        const errorData = await picksRes.json().catch(() => ({ error: "Could not find picks for this event." }));
        throw new Error(errorData.error || "Could not find picks for this event.");
      }
      if (!historyRes.ok) {
        throw new Error("Could not find history for this team.");
      }

      const entryData = await entryRes.json();
      const picksData = await picksRes.json();
      const historyData = await historyRes.json();

      setMyTeamInfo(entryData);
      setMyTeamHistory(historyData);
      
      // Enrich squad with player data
      const enrichedSquad = picksData.picks.map((pick: any) => {
        const player = players.find(p => p.id === pick.element);
        if (!player) return pick;
        
        const summary = playerSummaries[player.id];
        const metrics = calculateLast5Metrics(player.id);
        const fixtureEase = calculateFixtureEase(player.team);
        const realForm = summary ? metrics.points : parseFloat(player.form);
        const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap) : null;
        
        const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
        const baseVal = hasReliableProfile
          ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
          : realForm;
        
        return {
          ...player,
          ...pick,
          fixtureEase,
          realForm,
          valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
          perfProfile
        };
      });

      setMySquad(enrichedSquad);
      
      // Auto-fetch summaries for squad members if not present
      enrichedSquad.forEach((p: any) => {
        if (!playerSummaries[p.id]) fetchPlayerSummary(p.id);
      });

    } catch (err: any) {
      setMyTeamError(err.message);
    } finally {
      setMyTeamLoading(false);
    }
  };

  const fetchH2H = async (myId: string, oppId: string) => {
    if (!myId || !oppId || !currentGW) return;
    try {
      setMyTeamLoading(true);
      setOpponentLoading(true);
      setMyTeamError(null);
      setOpponentError(null);
      
      const fetchTeamData = async (id: string, isOpponent: boolean) => {
        const [entryRes, picksRes, historyRes] = await Promise.all([
          fetch(`/api/fpl/entry/${id}`),
          fetch(`/api/fpl/entry/${id}/event/${currentGW}/picks`),
          fetch(`/api/fpl/entry/${id}/history`)
        ]);

        if (!entryRes.ok) throw new Error(`Could not find team ${id}.`);
        if (!picksRes.ok) throw new Error(`Could not find picks for team ${id}.`);
        if (!historyRes.ok) throw new Error(`Could not find history for team ${id}.`);

        const entryData = await entryRes.json();
        const picksData = await picksRes.json();
        const historyData = await historyRes.json();

        if (isOpponent) {
          setOpponentTeamInfo(entryData);
          setOpponentTeamHistory(historyData);
        } else {
          setMyTeamInfo(entryData);
          setMyTeamHistory(historyData);
        }
        
        const enrichedSquad = picksData.picks.map((pick: any) => {
          const player = players.find(p => p.id === pick.element);
          if (!player) return pick;
          const summary = playerSummaries[player.id];
          const metrics = calculateLast5Metrics(player.id);
          const fixtureEase = calculateFixtureEase(player.team);
          const realForm = summary ? metrics.points : parseFloat(player.form);
          const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap) : null;

          const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
          const baseVal = hasReliableProfile
            ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
            : realForm;

          return {
            ...player,
            ...pick,
            fixtureEase,
            realForm,
            valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
            perfProfile
          };
        });

        if (isOpponent) setOpponentSquad(enrichedSquad);
        else setMySquad(enrichedSquad);
        
        enrichedSquad.forEach((p: any) => {
          if (!playerSummaries[p.id]) fetchPlayerSummary(p.id);
        });
      };

      await Promise.all([
        fetchTeamData(myId, false),
        fetchTeamData(oppId, true)
      ]);

    } catch (err: any) {
      setMyTeamError("Failed to fetch H2H data. Check Team IDs.");
    } finally {
      setMyTeamLoading(false);
      setOpponentLoading(false);
    }
  };

  const transferSuggestions = useMemo(() => {
    if (!mySquad.length || !players.length) return [];

    // 1. Identify "weak" links in current squad (lowest valueScore)
    const weakLinks = [...mySquad]
      .sort((a, b) => a.valueScore - b.valueScore)
      .slice(0, numTransfers); // Use the user-defined 'x'

    const suggestions = weakLinks.map(outPlayer => {
      // 2. Find better players in same position within budget
      // Budget = outPlayer cost + bank
      const budget = outPlayer.now_cost + (myTeamInfo?.last_deadline_bank || 0);
      
      const betterOptions = players
        .filter(p => 
          p.element_type === outPlayer.element_type && 
          p.id !== outPlayer.id &&
          p.now_cost <= budget &&
          !mySquad.some(s => s.id === p.id) &&
          // Enforce FPL limit: Max 3 players per team
          mySquad.filter(s => s.team === p.team && s.id !== outPlayer.id).length < 3
        )
        .map(p => {
          const metrics = calculateLast5Metrics(p.id);
          const fixtureEase = calculateFixtureEase(p.team);
          const summary = playerSummaries[p.id];
          const realForm = summary ? metrics.points : parseFloat(p.form);
          const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap) : null;

          // Weight by reliability: efficiency_rating * reliability_score prevents sub-heavy players
          // from inflating their score via a few lucky cameos.
          // Fall back to realForm if no performance data is available.
          const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
          const baseVal = hasReliableProfile
            ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
            : realForm;
          
          return {
            ...p,
            fixtureEase,
            realForm,
            valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
            perfProfile
          };
        })
        // Exclude near-inactive players (bench-warmers who rarely start)
        .filter(p => {
          if (!p.perfProfile || p.perfProfile.appearances < 3) return true; // not enough data to judge — include
          return p.perfProfile.reliability_score >= 0.2; // must start at least 1-in-5 games
        })
        .filter(p => p.valueScore > outPlayer.valueScore)
        .sort((a, b) => b.valueScore - a.valueScore)
        .slice(0, 6);

      return {
        out: outPlayer,
        options: betterOptions
      };
    });

    return suggestions;
  }, [mySquad, players, myTeamInfo, playerSummaries, numTransfers]);

  const h2hData = useMemo(() => {
    if (!mySquad.length || !opponentSquad.length) return null;

    const common = mySquad.filter(p => opponentSquad.some(op => op.id === p.id)).sort((a,b) => b.valueScore - a.valueScore);
    const myDiff = mySquad.filter(p => !opponentSquad.some(op => op.id === p.id)).sort((a,b) => b.valueScore - a.valueScore);
    const oppDiff = opponentSquad.filter(p => !mySquad.some(op => op.id === p.id)).sort((a,b) => b.valueScore - a.valueScore);

    // Transfer Suggestions targeted at weak differentials
    const weakLinks = [...myDiff].sort((a, b) => a.valueScore - b.valueScore).slice(0, numTransfers);
    
    const suggestions = weakLinks.map(outPlayer => {
      const budget = outPlayer.now_cost + (myTeamInfo?.last_deadline_bank || 0);
      const betterOptions = players
        .filter(p => 
          p.element_type === outPlayer.element_type && 
          p.id !== outPlayer.id &&
          p.now_cost <= budget &&
          !mySquad.some(s => s.id === p.id) &&
          !opponentSquad.some(op => op.id === p.id) && // Avoid buying their players, find unique edge
          // Enforce FPL limit: Max 3 players per team
          mySquad.filter(s => s.team === p.team && s.id !== outPlayer.id).length < 3
        )
        .map(p => {
          const metrics = calculateLast5Metrics(p.id);
          const fixtureEase = calculateFixtureEase(p.team);
          const summary = playerSummaries[p.id];
          const realForm = summary ? metrics.points : parseFloat(p.form);
          const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap) : null;

          const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
          const baseVal = hasReliableProfile
            ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
            : realForm;

          return {
            ...p,
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
  }, [mySquad, opponentSquad, players, myTeamInfo, playerSummaries, numTransfers]);

  const teamScheduleData = useMemo(() => {
    return teams.map(team => {
      const next5Avg = calculateAvgDifficulty(team.id, 5, 0);
      const following5Avg = calculateAvgDifficulty(team.id, 5, 5);
      const trend = following5Avg === 0 ? 0 : next5Avg - following5Avg; // Positive trend means schedule is getting easier (FDR decreasing)

      return {
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        next5Avg,
        following5Avg,
        trend,
        fixtures: getNextFixtures(team.id, 5)
      };
    }).sort((a, b) => a.next5Avg - b.next5Avg); // Sort by easiest first (lowest FDR)
  }, [teams, fixtures]);

  const processedPlayers = useMemo(() => {
    return players
      .filter(p => {
        const matchesPosition = selectedPosition ? p.element_type === selectedPosition : true;
        const matchesSearch = p.web_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             getTeamName(p.team).toLowerCase().includes(searchQuery.toLowerCase());
        return matchesPosition && matchesSearch;
      })
      .map(p => {
        const metrics = calculateLast5Metrics(p.id);
        const fixtureEase = calculateFixtureEase(p.team);
        const summary = playerSummaries[p.id];
        const realForm = summary ? metrics.points : parseFloat(p.form);
        const perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap) : null;
        
        const hasReliableProfile = perfProfile && perfProfile.appearances > 0;
        const baseVal = hasReliableProfile
          ? perfProfile!.efficiency_rating * perfProfile!.reliability_score
          : realForm;

        return {
          ...p,
          fixtureEase,
          realForm,
          valueScore: parseFloat((baseVal * fixtureEase).toFixed(2)),
          metrics,
          perfProfile
        };
      })
      .sort((a, b) => {
        const { key, direction } = sortConfig;
        let aValue: any;
        let bValue: any;

        if (key.startsWith('metrics.')) {
          const metricKey = key.split('.')[1];
          aValue = (a.metrics as any)[metricKey];
          bValue = (b.metrics as any)[metricKey];
        } else if (key.startsWith('perfProfile.')) {
          const profileKey = key.split('.')[1];
          aValue = a.perfProfile ? (a.perfProfile as any)[profileKey] ?? -Infinity : -Infinity;
          bValue = b.perfProfile ? (b.perfProfile as any)[profileKey] ?? -Infinity : -Infinity;
        } else {
          aValue = (a as any)[key];
          bValue = (b as any)[key];
        }

        if (aValue < bValue) return direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return direction === 'asc' ? 1 : -1;
        return 0;
      })
      .slice(0, 50);
  }, [players, fixtures, selectedPosition, searchQuery, playerSummaries, sortConfig]);

  // Prefetch summaries for all currently-visible players (reacts to filter/search changes)
  useEffect(() => {
    if (!processedPlayers.length) return;

    // Identify players visible in the list that don't have a summary yet and haven't been queued
    const toFetch = processedPlayers.filter(
      p => !playerSummaries[p.id] && !fetchedIdsRef.current.has(p.id)
    );
    if (toFetch.length === 0) return;

    // Mark them as queued immediately to prevent parallel effect runs from re-queueing
    toFetch.forEach(p => fetchedIdsRef.current.add(p.id));

    const fetchBatch = async () => {
      setIsFetchingSummaries(true);
      for (const p of toFetch) {
        await fetchPlayerSummary(p.id);
        await new Promise(r => setTimeout(r, 100)); // 100ms delay = ~5s for 50 players, within rate limits
      }
      setIsFetchingSummaries(false);
    };

    fetchBatch();
  }, [processedPlayers]);

  const vizData = useMemo(() => {
    return processedPlayers
      .map(p => ({
        name: p.web_name,
        form: p.realForm,
        ease: p.fixtureEase,
        pos: p.element_type,
        team: getTeamShortName(p.team),
        points: p.total_points
      }));
  }, [processedPlayers, playerSummaries]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center font-sans">
        <Loader2 className="w-12 h-12 animate-spin text-[#141414] mb-4" />
        <p className="text-[#141414] font-mono text-sm tracking-widest uppercase">Initializing FPL Data Engine...</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center font-sans p-8">
        <div className="text-rose-600 mb-4">
          <Info className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-serif italic mb-4 text-center">Data Unavailable</h2>
        <p className="text-[#141414]/70 font-mono text-sm tracking-widest uppercase text-center max-w-md leading-relaxed border border-[#141414]/20 p-6 bg-white/5">
          {apiError}
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-3 bg-[#141414] text-[#E4E3E0] font-mono text-xs uppercase tracking-widest hover:opacity-90 transition-opacity"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] font-sans p-4 md:p-8">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12 border-b border-[#141414] pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-5xl md:text-7xl font-serif italic tracking-tighter leading-none mb-4">
              Form & Fixture
            </h1>
            <div className="flex items-center gap-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
                Performance Analysis / GW {currentGW || "???"}
              </p>
              {isFetchingSummaries && (
                <div className="flex items-center gap-2 font-mono text-[10px] text-emerald-600 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> SYNCING MATCH DATA
                </div>
              )}
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4].map(pos => (
              <button
                key={pos}
                onClick={() => setSelectedPosition(selectedPosition === pos ? null : pos)}
                className={`px-4 py-2 font-mono text-xs uppercase tracking-wider border border-[#141414] transition-all
                  ${selectedPosition === pos ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
              >
                {POSITION_MAP[pos]}s
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="max-w-7xl mx-auto mb-8 flex border-b border-[#141414]/20">
        <button 
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "list" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <LayoutGrid size={14} /> Player List
        </button>
        <button 
          onClick={() => setActiveTab("viz")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "viz" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <BarChart2 size={14} /> Visualization
        </button>
        <button 
          onClick={() => setActiveTab("schedule")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "schedule" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <Calendar size={14} /> Team Schedule
        </button>
        <button 
          onClick={() => setActiveTab("team")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "team" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <Shield size={14} /> My Team
        </button>
        <button 
          onClick={() => setActiveTab("h2h")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "h2h" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <Swords size={14} /> H2H Matchup
        </button>
        <button 
          onClick={() => setActiveTab("performance")}
          className={`flex items-center gap-2 px-6 py-3 font-mono text-xs uppercase tracking-widest transition-all
            ${activeTab === "performance" ? "border-b-2 border-[#141414] opacity-100" : "opacity-40 hover:opacity-100"}`}
        >
          <Zap size={14} /> Archetypes
        </button>
      </div>

      {/* Search Bar (Only for List) */}
      {activeTab === "list" && (
        <div className="max-w-7xl mx-auto mb-8">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
            <input 
              type="text"
              placeholder="SEARCH PLAYER OR TEAM..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border border-[#141414] py-4 pl-12 pr-4 font-mono text-sm focus:outline-none focus:bg-white/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto">
        {activeTab === "list" ? (
          <div className="border-t border-[#141414]">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[40px_2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest text-center">
              <div className="text-left">#</div>
              <div 
                className="text-left cursor-pointer hover:opacity-100 flex items-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'web_name', direction: prev.key === 'web_name' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
              >
                Player / Team {sortConfig.key === 'web_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'element_type', direction: prev.key === 'element_type' && prev.direction === 'asc' ? 'desc' : 'asc' }))}
              >
                Position {sortConfig.key === 'element_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'realForm', direction: prev.key === 'realForm' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                Form (L5) {sortConfig.key === 'realForm' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'fixtureEase', direction: prev.key === 'fixtureEase' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                Ease {sortConfig.key === 'fixtureEase' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'valueScore', direction: prev.key === 'valueScore' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                Value {sortConfig.key === 'valueScore' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                title="Goals Scored (Last 5)" 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'metrics.goals', direction: prev.key === 'metrics.goals' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                G {sortConfig.key === 'metrics.goals' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                title="Assists (Last 5)" 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'metrics.assists', direction: prev.key === 'metrics.assists' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                A {sortConfig.key === 'metrics.assists' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                title="Clean Sheets (Last 5)" 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'metrics.cleanSheets', direction: prev.key === 'metrics.cleanSheets' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                CS {sortConfig.key === 'metrics.cleanSheets' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                title="Bonus Points (Last 5)" 
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'metrics.bonus', direction: prev.key === 'metrics.bonus' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                B {sortConfig.key === 'metrics.bonus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div 
                title="Performance Base PP90"
                className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1"
                onClick={() => setSortConfig(prev => ({ key: 'perfProfile.base_pp90', direction: prev.key === 'perfProfile.base_pp90' && prev.direction === 'desc' ? 'asc' : 'desc' }))}
              >
                PP90 {sortConfig.key === 'perfProfile.base_pp90' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </div>
              <div>Upcoming FDR</div>
            </div>

            {/* Player Rows */}
            <div className="divide-y divide-[#141414]">
              {processedPlayers.map((player, index) => {
                const Icon = POSITION_ICONS[player.element_type];
                const isExpanded = expandedPlayer === player.id;
                const upcoming = getNextFixtures(player.team, 5);

                return (
                  <div key={player.id} className="group">
                    <div 
                      onClick={() => {
                        setExpandedPlayer(isExpanded ? null : player.id);
                        fetchPlayerSummary(player.id);
                      }}
                      className={`grid grid-cols-1 md:grid-cols-[40px_2fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] p-4 items-center cursor-pointer transition-all text-center
                        ${isExpanded ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
                    >
                      <div className="hidden md:block font-mono text-xs opacity-50 text-left">
                        {String(index + 1).padStart(2, '0')}
                      </div>
                      
                      <div className="flex items-center gap-4 text-left">
                        <div className={`p-2 border border-current rounded-full ${POSITION_COLORS[player.element_type]}`}>
                          <Icon size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-lg tracking-tight leading-none mb-1">
                            {player.web_name}
                          </div>
                          <div className="font-mono text-[10px] uppercase opacity-60 tracking-wider">
                            {getTeamName(player.team)} • £{(player.now_cost / 10).toFixed(1)}m
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block font-mono text-xs uppercase tracking-widest opacity-70">
                        {POSITION_MAP[player.element_type]}
                      </div>

                      <div className="flex items-center justify-center gap-2 mt-4 md:mt-0">
                        <span className="md:hidden font-mono text-[10px] uppercase opacity-50 mr-2">Form:</span>
                        <span className="font-mono text-lg font-bold">
                          {player.realForm}
                        </span>
                        {player.realForm > 5 ? (
                          <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                        ) : player.realForm < 2 ? (
                          <ArrowDownRight className="w-4 h-4 text-rose-500" />
                        ) : null}
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <span className="md:hidden font-mono text-[10px] uppercase opacity-50 mr-2">Ease:</span>
                        <span className="font-mono text-lg font-bold">
                          {player.fixtureEase}
                        </span>
                        {player.fixtureEase > 3 ? (
                          <TrendingUp className="w-4 h-4 text-emerald-500" />
                        ) : null}
                      </div>

                      <div className="flex items-center justify-center gap-2">
                        <span className="md:hidden font-mono text-[10px] uppercase opacity-50 mr-2">Value:</span>
                        <span className="font-mono text-lg font-bold text-emerald-500">
                          {player.valueScore}
                        </span>
                      </div>

                      {/* New Metrics Columns */}
                      <div className="hidden md:block font-mono text-sm opacity-80">
                        {player.metrics.goals}
                      </div>
                      <div className="hidden md:block font-mono text-sm opacity-80">
                        {player.metrics.assists}
                      </div>
                      <div className="hidden md:block font-mono text-sm opacity-80">
                        {player.metrics.cleanSheets}
                      </div>
                      <div className="hidden md:block font-mono text-sm opacity-80">
                        {player.metrics.bonus}
                      </div>

                      <div className="hidden md:flex items-center justify-center font-mono text-sm font-bold text-blue-500">
                        {player.perfProfile ? player.perfProfile.base_pp90 : '-'}
                      </div>

                      <div className="flex justify-center gap-1 mt-4 md:mt-0">
                        {upcoming.map((f, i) => (
                          <div 
                            key={i}
                            className={`w-8 h-8 flex items-center justify-center font-mono text-[10px] border border-current
                              ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20' : (f.difficulty <= 2 ? 'bg-emerald-500/20' : f.difficulty >= 4 ? 'bg-rose-500/20' : '')}`}
                            title={f.isBlank ? `GW ${f.event}: BLANK` : `${f.opponent} (${f.isHome ? 'H' : 'A'}) - FDR: ${f.difficulty}`}
                          >
                            {f.opponent}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden bg-[#141414] text-[#E4E3E0] border-t border-[#E4E3E0]/10"
                        >
                          <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-12">
                            {/* Last 5 Matches */}
                            <div className="md:col-span-2">
                              <h4 className="font-serif italic text-xl mb-6 border-b border-[#E4E3E0]/20 pb-2">Recent Performance</h4>
                              {!playerSummaries[player.id] ? (
                                <div className="flex items-center gap-2 font-mono text-xs opacity-50">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Fetching match data...
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {playerSummaries[player.id].history.slice(-5).reverse().map((h, i) => (
                                    <div key={i} className="flex items-center justify-between font-mono text-xs border-b border-[#E4E3E0]/10 pb-2">
                                      <div className="flex flex-col">
                                        <span className="opacity-50 text-[10px]">{new Date(h.kickoff_time).toLocaleDateString()}</span>
                                        <span>vs {getTeamShortName(h.opponent_team)} ({h.was_home ? 'H' : 'A'})</span>
                                      </div>
                                      <div className="flex items-center gap-6">
                                        <div className="flex flex-col items-center">
                                          <span className="opacity-50 text-[10px]">MINS</span>
                                          <span>{h.minutes}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                          <span className="opacity-50 text-[10px]">G/A</span>
                                          <span>{h.goals_scored}/{h.assists}</span>
                                        </div>
                                        <div className="flex flex-col items-center">
                                          <span className="opacity-50 text-[10px]">CS/B</span>
                                          <span>{h.clean_sheets}/{h.bonus}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                          <span className="opacity-50 text-[10px]">PTS</span>
                                          <span className="text-lg font-bold text-emerald-400">{h.total_points}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Stats & Insights */}
                            <div>
                              <h4 className="font-serif italic text-xl mb-6 border-b border-[#E4E3E0]/20 pb-2">L5 Metrics</h4>
                              <div className="space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="bg-white/5 p-4 border border-white/10">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Goals</div>
                                    <div className="text-2xl font-bold">{player.metrics.goals}</div>
                                  </div>
                                  <div className="bg-white/5 p-4 border border-white/10">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Assists</div>
                                    <div className="text-2xl font-bold">{player.metrics.assists}</div>
                                  </div>
                                  <div className="bg-white/5 p-4 border border-white/10">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Clean Sheets</div>
                                    <div className="text-2xl font-bold">{player.metrics.cleanSheets}</div>
                                  </div>
                                  <div className="bg-white/5 p-4 border border-white/10">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-1">Bonus</div>
                                    <div className="text-2xl font-bold">{player.metrics.bonus}</div>
                                  </div>
                                </div>
                                
                                <div className="p-4 border border-emerald-500/30 bg-emerald-500/5">
                                  <div className="flex items-center gap-2 font-serif italic text-emerald-400 mb-2">
                                    <Info size={14} /> Analysis
                                  </div>
                                  <p className="font-mono text-[10px] leading-relaxed opacity-70">
                                    {player.web_name} has averaged {player.realForm} points over the last 5 games. 
                                    With a fixture ease of {player.fixtureEase}, they are a 
                                    {player.realForm > 5 && player.fixtureEase > 3 ? " prime transfer target." : 
                                     player.realForm > 5 ? " high-form asset with challenging fixtures." :
                                     player.fixtureEase > 3 ? " potential differential with easy games." : " standard asset."}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          {/* Performance Profile */}
                          {player.perfProfile && player.perfProfile.archetype !== "Not Enough Data" ? (
                            <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2">
                              <h4 className="font-serif italic text-xl mb-6 flex items-center gap-2">
                                <Zap size={20} className="text-emerald-400" /> Performance Archetype: {player.perfProfile.archetype}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                <div className="font-mono text-sm leading-relaxed opacity-80 border-l-2 border-emerald-400 pl-4">
                                  {player.perfProfile.archetype_blurb}
                                  <div className="mt-4 opacity-50 text-[10px] uppercase">
                                    Based on {player.perfProfile.appearances} apps ({player.perfProfile.total_minutes} mins)
                                  </div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                                  <div className="bg-white/5 p-3 flex flex-col justify-center">
                                    <span className="text-[10px] opacity-50 mb-1">FDR 2</span>
                                    <span className="text-lg font-bold text-emerald-400">{player.perfProfile.pp90_fdr2?.toFixed(1) ?? "-"}</span>
                                  </div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center">
                                    <span className="text-[10px] opacity-50 mb-1">FDR 3</span>
                                    <span className="text-lg font-bold">{player.perfProfile.pp90_fdr3?.toFixed(1) ?? "-"}</span>
                                  </div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center">
                                    <span className="text-[10px] opacity-50 mb-1">FDR 4</span>
                                    <span className="text-lg font-bold text-rose-300">{player.perfProfile.pp90_fdr4?.toFixed(1) ?? "-"}</span>
                                  </div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center">
                                    <span className="text-[10px] opacity-50 mb-1">FDR 5</span>
                                    <span className="text-lg font-bold text-rose-500">{player.perfProfile.pp90_fdr5?.toFixed(1) ?? "-"}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2 opacity-50">
                              <div className="flex items-center gap-2 font-serif italic text-lg mb-2">
                                <Zap size={16} /> Performance Profile: Pending
                              </div>
                              <p className="font-mono text-[10px] uppercase tracking-widest">
                                Insufficient minutes found to generate a reliable tactical archetype (requires 3+ apps).
                              </p>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ) : activeTab === "viz" ? (
          /* Visualization View */
          <div className="bg-white/5 border border-[#141414] p-8 min-h-[600px]">
            <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-serif italic text-2xl mb-2">Form vs. Fixture Ease</h3>
                <p className="font-mono text-[10px] opacity-50 uppercase tracking-widest">
                  Top right quadrant = High Form + Easy Fixtures (Transfer Targets)
                </p>
              </div>
              <div className="flex gap-4">
                {[1, 2, 3, 4].map(pos => (
                  <div key={pos} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: CHART_COLORS[pos] }} />
                    {POSITION_MAP[pos]}
                  </div>
                ))}
              </div>
            </div>

            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <XAxis 
                    type="number" 
                    dataKey="ease" 
                    name="Fixture Ease" 
                    domain={[0, 5]}
                    stroke="#141414"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  >
                    <Label value="FIXTURE EASE (5 = EASIEST)" offset={-10} position="insideBottom" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.5 }} />
                  </XAxis>
                  <YAxis 
                    type="number" 
                    dataKey="form" 
                    name="Form (L5)" 
                    domain={[0, 'auto']}
                    stroke="#141414"
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  >
                    <Label value="FORM (AVG PTS L5)" angle={-90} position="insideLeft" style={{ fontFamily: 'JetBrains Mono', fontSize: 10, opacity: 0.5 }} />
                  </YAxis>
                  <ZAxis type="number" dataKey="points" range={[50, 400]} name="Total Points" />
                  <Tooltip 
                    cursor={{ strokeDasharray: '3 3' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-[#141414] text-[#E4E3E0] p-4 border border-white/20 font-mono text-[10px]">
                            <div className="font-bold text-sm mb-2 border-b border-white/20 pb-1">{data.name} ({data.team})</div>
                            <div>FORM: {data.form}</div>
                            <div>EASE: {data.ease}</div>
                            <div>TOTAL PTS: {data.points}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Scatter name="Players" data={vizData}>
                    {vizData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[entry.pos]} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : activeTab === "schedule" ? (
          /* Schedule View */
          <div className="border-t border-[#141414]">
            <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest">
              <div>Team</div>
              <div>Next 5 Avg</div>
              <div>Trend</div>
              <div>Next 5 Fixtures</div>
            </div>
            <div className="divide-y divide-[#141414]">
              {teamScheduleData.map((team) => (
                <div key={team.id} className="grid grid-cols-[2fr_1fr_1fr_1.5fr] p-4 items-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
                  <div className="font-bold text-lg tracking-tight">{team.name}</div>
                  <div className="font-mono text-lg font-bold">
                    {team.next5Avg}
                  </div>
                  <div className="flex items-center gap-2">
                    {team.trend > 0 ? (
                      <div className="flex items-center gap-1 text-emerald-500 font-mono text-[10px]">
                        <ArrowUpRight size={12} /> IMPROVING
                      </div>
                    ) : team.trend < 0 ? (
                      <div className="flex items-center gap-1 text-rose-500 font-mono text-[10px]">
                        <ArrowDownRight size={12} /> TOUGHENING
                      </div>
                    ) : (
                      <div className="text-gray-500 font-mono text-[10px]">STABLE</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {team.fixtures.map((f, i) => (
                      <div 
                        key={i}
                        className={`w-10 h-10 flex flex-col items-center justify-center font-mono text-[10px] border border-current
                          ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20' : (f.difficulty <= 2 ? 'bg-emerald-500/20' : f.difficulty >= 4 ? 'bg-rose-500/20' : '')}`}
                      >
                        <span className="opacity-50 text-[8px]">GW{f.event}</span>
                        <span className="font-bold">{f.opponent}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeTab === "team" ? (
          /* My Team View */
          <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-12 text-center">
              <h2 className="font-serif italic text-4xl mb-4">Squad Analysis</h2>
              <p className="font-mono text-xs opacity-50 uppercase tracking-widest">
                Enter your FPL Team ID to identify weak links and transfer targets
              </p>
              
              <div className="mt-8 flex flex-col items-center gap-6">
                <div className="flex gap-2 justify-center">
                  <input 
                    type="text" 
                    value={myTeamId}
                    onChange={(e) => setMyTeamId(e.target.value)}
                    placeholder="TEAM ID (e.g. 123456)"
                    className="bg-transparent border border-[#141414] px-4 py-2 font-mono text-sm focus:outline-none w-64"
                  />
                  <button 
                    onClick={() => fetchMyTeam(myTeamId)}
                    disabled={myTeamLoading}
                    className="bg-[#141414] text-[#E4E3E0] px-6 py-2 font-mono text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                  >
                    {myTeamLoading ? "Syncing..." : "Analyze Squad"}
                  </button>
                </div>

                {mySquad.length > 0 && (
                  <div className="flex items-center gap-4 bg-white/50 p-4 border border-[#141414]/10">
                    <span className="font-mono text-[10px] uppercase opacity-60">Analyze top X weak links:</span>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(num => (
                        <button
                          key={num}
                          onClick={() => setNumTransfers(num)}
                          className={`w-8 h-8 font-mono text-xs border border-[#141414] transition-all
                            ${numTransfers === num ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10'}`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {myTeamError && (
                <p className="mt-4 text-rose-500 font-mono text-[10px] uppercase">{myTeamError}</p>
              )}
            </div>

            {mySquad.length > 0 && (
              <div className="space-y-16">
                {/* Team Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 border-y border-[#141414] py-8">
                  <div className="text-center">
                    <div className="font-serif italic text-2xl">{myTeamInfo?.player_first_name} {myTeamInfo?.player_last_name}</div>
                    <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{myTeamInfo?.name}</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-2xl font-bold">£{(myTeamInfo?.last_deadline_bank / 10).toFixed(1)}m</div>
                    <div className="font-mono text-[10px] opacity-50 uppercase mt-1">Bank Balance</div>
                  </div>
                  <div className="text-center">
                    <div className="font-mono text-2xl font-bold">{myTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
                    <div className="font-mono text-[10px] opacity-50 uppercase mt-1">Overall Rank</div>
                  </div>
                </div>

                {/* Form & Chips */}
                {myTeamHistory && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-8 border-b border-[#141414]/20">
                    <div className="text-center">
                      <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest">Last 5 GWs Points</div>
                      <div className="flex justify-center gap-2">
                        {myTeamHistory.current.slice(-5).map((gw: any, i: number) => (
                          <div key={i} className="flex flex-col items-center border border-[#141414] w-10 py-1 bg-[#141414] text-[#E4E3E0]">
                            <span className="text-[8px] opacity-60">GW{gw.event}</span>
                            <span className="font-bold text-sm">{gw.points}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest">Chips Played</div>
                      <div className="flex justify-center gap-2 flex-wrap">
                        {myTeamHistory.chips.length === 0 ? (
                          <span className="font-mono text-[10px] italic opacity-50">None</span>
                        ) : (
                          myTeamHistory.chips.map((chip: any, i: number) => (
                            <div key={i} className="px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono text-[8px] uppercase tracking-wider">
                              {chip.name === 'bbench' ? 'Bench Boost' : chip.name === '3xc' ? 'Triple Capt' : chip.name === 'freehit' ? 'Free Hit' : chip.name === 'manager' ? 'Mystery' : 'Wildcard'} (GW{chip.event})
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest">Chips Available</div>
                      <div className="flex justify-center gap-2 flex-wrap">
                        {(() => {
                          const playedList = myTeamHistory.chips.map((c: any) => c.name);
                          const allStandard = ['wildcard', 'freehit', 'bbench', '3xc', 'manager'];
                          const available = allStandard.filter(c => {
                             if (c === 'wildcard') {
                               return playedList.filter((x: string) => x === 'wildcard').length < 2;
                             }
                             return !playedList.includes(c);
                          });
                          
                          if (available.length === 0) return <span className="font-mono text-[10px] italic opacity-50">None</span>;
                          
                          return available.map((c, i) => (
                            <div key={i} className="px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-mono text-[8px] uppercase tracking-wider">
                              {c === 'bbench' ? 'Bench Boost' : c === '3xc' ? 'Triple Capt' : c === 'freehit' ? 'Free Hit' : c === 'manager' ? 'Mystery' : 'Wildcard'}
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Transfer Suggestions */}
                <div>
                  <h3 className="font-serif italic text-2xl mb-8 flex items-center gap-3">
                    <TrendingUp className="w-6 h-6" /> Recommended Transfers (Top {numTransfers})
                  </h3>
                  
                  <div className="space-y-12">
                    {transferSuggestions.map((suggestion, i) => (
                      <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.5fr] gap-8 items-center bg-[#141414]/5 p-6 border border-[#141414]/10">
                        {/* Out */}
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full">
                            <ArrowDownRight size={20} />
                          </div>
                          <div>
                            <div className="font-bold text-lg">{suggestion.out.web_name}</div>
                            <div className="font-mono text-[10px] opacity-50 uppercase">
                              {getTeamShortName(suggestion.out.team)} • £{(suggestion.out.now_cost / 10).toFixed(1)}m
                            </div>
                            <div className="mt-2 font-mono text-[10px] text-rose-500">
                              VALUE SCORE: {suggestion.out.valueScore}
                            </div>
                          </div>
                        </div>

                        <div className="hidden md:block text-[#141414]/20">
                          <ChevronRight size={32} />
                        </div>

                        {/* Options */}
                        <div className="space-y-3">
                          <div className="font-mono text-[10px] opacity-50 uppercase tracking-widest mb-2">Better Options (Within Budget)</div>
                          {suggestion.options.length === 0 ? (
                            <div className="font-mono text-[10px] opacity-50 italic">No better options found within budget for this position.</div>
                          ) : (
                            <>
                              {(expandedTransfers[suggestion.out.id] ? suggestion.options : suggestion.options.slice(0, 3)).map((opt: any, j: number) => (
                                <div key={j} className="flex items-center justify-between bg-white p-3 border border-[#141414]/10 shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="text-emerald-500">
                                      <ArrowUpRight size={16} />
                                    </div>
                                    <div>
                                      <div className="font-bold text-sm">{opt.web_name}</div>
                                      <div className="font-mono text-[10px] opacity-50 uppercase">
                                        {getTeamShortName(opt.team)} • £{(opt.now_cost / 10).toFixed(1)}m
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-mono text-sm font-bold text-emerald-500">+{ (opt.valueScore - suggestion.out.valueScore).toFixed(1) }</div>
                                    <div className="font-mono text-[10px] opacity-50 uppercase">Value Gain</div>
                                  </div>
                                </div>
                              ))}
                              {suggestion.options.length > 3 && (
                                <button 
                                  onClick={() => setExpandedTransfers(prev => ({ ...prev, [suggestion.out.id]: !prev[suggestion.out.id] }))}
                                  className="w-full py-2 font-mono text-[10px] uppercase tracking-widest border border-[#141414]/20 hover:bg-[#141414]/5 transition-colors mt-2"
                                >
                                  {expandedTransfers[suggestion.out.id] ? "Show Less" : "Show More Options"}
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Current Squad Table */}
                <div>
                  <h3 className="font-serif italic text-2xl mb-6">Current Squad Metrics</h3>
                  <div className="border border-[#141414]/10">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr] p-3 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest">
                      <div>Player</div>
                      <div className="text-center">Form</div>
                      <div className="text-center">Ease</div>
                      <div className="text-center">Value</div>
                    </div>
                    {mySquad.sort((a, b) => b.valueScore - a.valueScore).map((p, i) => (
                      <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr] p-3 border-b border-[#141414]/10 font-mono text-xs items-center">
                        <div>
                          <div className="font-bold">{p.web_name}</div>
                          <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(p.team)}</div>
                        </div>
                        <div className="text-center">{p.realForm}</div>
                        <div className="text-center">{p.fixtureEase}</div>
                        <div className="text-center font-bold text-emerald-600">{p.valueScore}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === "h2h" ? (
          /* H2H View */
          <div className="p-4 md:p-8 max-w-6xl mx-auto">
            <div className="mb-12 text-center">
              <h2 className="font-serif italic text-4xl mb-4">H2H Matchup</h2>
              <p className="font-mono text-xs opacity-50 uppercase tracking-widest">
                Compare your team against an opponent to find transfer edges
              </p>
              
              <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-6">
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <label className="font-mono text-[10px] uppercase opacity-60 text-left">My Team ID</label>
                  <input 
                    type="text" 
                    value={myTeamId}
                    onChange={(e) => setMyTeamId(e.target.value)}
                    placeholder="e.g. 123456"
                    className="bg-transparent border border-[#141414] px-4 py-2 font-mono text-sm focus:outline-none w-full"
                  />
                </div>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  <label className="font-mono text-[10px] uppercase opacity-60 text-left">Opponent Team ID</label>
                  <input 
                    type="text" 
                    value={opponentTeamId}
                    onChange={(e) => setOpponentTeamId(e.target.value)}
                    placeholder="e.g. 654321"
                    className="bg-transparent border border-[#141414] px-4 py-2 font-mono text-sm focus:outline-none w-full"
                  />
                </div>
              </div>
              
              <div className="mt-6">
                <button 
                  onClick={() => fetchH2H(myTeamId, opponentTeamId)}
                  disabled={myTeamLoading || opponentLoading || !myTeamId || !opponentTeamId}
                  className="bg-[#141414] text-[#E4E3E0] px-8 py-3 font-mono text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {myTeamLoading || opponentLoading ? "Syncing Matchup..." : "Analyze Matchup"}
                </button>
              </div>

              {myTeamError && (
                <p className="mt-4 text-rose-500 font-mono text-[10px] uppercase">{myTeamError}</p>
              )}
            </div>

            {h2hData && (
              <div className="space-y-16">
                {/* Team Overviews Side-by-Side */}
                <div className="grid grid-cols-2 gap-8 border-y border-[#141414] py-8">
                  {/* My Team Details */}
                  <div className="text-center md:text-right border-r border-[#141414]/20 pr-4 md:pr-8">
                    <div className="font-serif italic text-2xl">{myTeamInfo?.player_first_name} {myTeamInfo?.player_last_name}</div>
                    <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{myTeamInfo?.name}</div>
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-xl font-bold">£{(myTeamInfo?.last_deadline_bank / 10).toFixed(1)}m</div>
                        <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
                      </div>
                      <div>
                        <div className="font-mono text-xl font-bold">{myTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
                        <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Overall Rank</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Opponent Details */}
                  <div className="text-center md:text-left pl-4 md:pl-8">
                    <div className="font-serif italic text-2xl">{opponentTeamInfo?.player_first_name} {opponentTeamInfo?.player_last_name}</div>
                    <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{opponentTeamInfo?.name}</div>
                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <div>
                        <div className="font-mono text-xl font-bold">£{(opponentTeamInfo?.last_deadline_bank / 10).toFixed(1)}m</div>
                        <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
                      </div>
                      <div>
                        <div className="font-mono text-xl font-bold">{opponentTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
                        <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Overall Rank</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Form & Chips Comparison */}
                {myTeamHistory && opponentTeamHistory && (
                  <div className="grid grid-cols-2 gap-8 border-y border-[#141414] py-8">
                    {/* My Team Form & Chips */}
                    <div className="border-r border-[#141414]/20 pr-4 md:pr-8">
                      <div className="mb-6">
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest text-center md:text-right">Last 5 GWs Points</div>
                        <div className="flex justify-center md:justify-end gap-2">
                          {myTeamHistory.current.slice(-5).map((gw: any, i: number) => (
                            <div key={i} className="flex flex-col items-center border border-[#141414] w-10 py-1 bg-[#141414] text-[#E4E3E0]">
                              <span className="text-[8px] opacity-60">GW{gw.event}</span>
                              <span className="font-bold text-sm">{gw.points}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mb-4">
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest text-center md:text-right">Chips Played</div>
                        <div className="flex justify-center md:justify-end gap-2 flex-wrap">
                          {myTeamHistory.chips.length === 0 ? (
                            <span className="font-mono text-[10px] italic opacity-50">None</span>
                          ) : (
                            myTeamHistory.chips.map((chip: any, i: number) => (
                              <div key={i} className="px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono text-[8px] uppercase tracking-wider">
                                {chip.name === 'bbench' ? 'Bench Boost' : chip.name === '3xc' ? 'Triple Capt' : chip.name === 'freehit' ? 'Free Hit' : chip.name === 'manager' ? 'Mystery' : 'Wildcard'} (GW{chip.event})
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest text-center md:text-right">Chips Available</div>
                        <div className="flex justify-center md:justify-end gap-2 flex-wrap">
                          {(() => {
                            const playedList = myTeamHistory.chips.map((c: any) => c.name);
                            const allStandard = ['wildcard', 'freehit', 'bbench', '3xc', 'manager'];
                            const available = allStandard.filter(c => {
                               if (c === 'wildcard') {
                                 return playedList.filter((x: string) => x === 'wildcard').length < 2;
                               }
                               return !playedList.includes(c);
                            });
                            
                            if (available.length === 0) return <span className="font-mono text-[10px] italic opacity-50">None</span>;
                            
                            return available.map((c, i) => (
                              <div key={i} className="px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-mono text-[8px] uppercase tracking-wider">
                                {c === 'bbench' ? 'Bench Boost' : c === '3xc' ? 'Triple Capt' : c === 'freehit' ? 'Free Hit' : c === 'manager' ? 'Mystery' : 'Wildcard'}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Opponent Team Form & Chips */}
                    <div className="pl-4 md:pl-8">
                      <div className="mb-6">
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest text-center md:text-left">Last 5 GWs Points</div>
                        <div className="flex justify-center md:justify-start gap-2">
                          {opponentTeamHistory.current.slice(-5).map((gw: any, i: number) => (
                            <div key={i} className="flex flex-col items-center border border-[#141414] w-10 py-1 bg-[#141414] text-[#E4E3E0]">
                              <span className="text-[8px] opacity-60">GW{gw.event}</span>
                              <span className="font-bold text-sm">{gw.points}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mb-4">
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest text-center md:text-left">Chips Played</div>
                        <div className="flex justify-center md:justify-start gap-2 flex-wrap">
                          {opponentTeamHistory.chips.length === 0 ? (
                            <span className="font-mono text-[10px] italic opacity-50">None</span>
                          ) : (
                            opponentTeamHistory.chips.map((chip: any, i: number) => (
                              <div key={i} className="px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono text-[8px] uppercase tracking-wider">
                                {chip.name === 'bbench' ? 'Bench Boost' : chip.name === '3xc' ? 'Triple Capt' : chip.name === 'freehit' ? 'Free Hit' : chip.name === 'manager' ? 'Mystery' : 'Wildcard'} (GW{chip.event})
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest text-center md:text-left">Chips Available</div>
                        <div className="flex justify-center md:justify-start gap-2 flex-wrap">
                          {(() => {
                            const playedList = opponentTeamHistory.chips.map((c: any) => c.name);
                            const allStandard = ['wildcard', 'freehit', 'bbench', '3xc', 'manager'];
                            const available = allStandard.filter(c => {
                               if (c === 'wildcard') {
                                 return playedList.filter((x: string) => x === 'wildcard').length < 2;
                               }
                               return !playedList.includes(c);
                            });
                            
                            if (available.length === 0) return <span className="font-mono text-[10px] italic opacity-50">None</span>;
                            
                            return available.map((c, i) => (
                              <div key={i} className="px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-mono text-[8px] uppercase tracking-wider">
                                {c === 'bbench' ? 'Bench Boost' : c === '3xc' ? 'Triple Capt' : c === 'freehit' ? 'Free Hit' : c === 'manager' ? 'Mystery' : 'Wildcard'}
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3-Column Pitch Comparison */}
                <div>
                  <h3 className="font-serif italic text-2xl mb-8 text-center flex items-center justify-center gap-3">
                    <Swords className="w-6 h-6" /> Matchup Breakdown
                  </h3>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* My Differentials */}
                    <div className="border border-[#141414]/10 bg-emerald-500/5">
                      <div className="bg-[#141414] text-[#E4E3E0] p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
                        <span>My Differentials</span>
                        <span className="opacity-60">{h2hData.myDiff.length}</span>
                      </div>
                      <div className="divide-y divide-[#141414]/10">
                        {h2hData.myDiff.map((p, i) => (
                          <div key={i} className="p-3 flex justify-between items-center bg-white/50">
                            <div>
                              <div className="font-bold text-sm">{p.web_name}</div>
                              <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(p.team)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-emerald-600">{p.valueScore}</div>
                              <div className="text-[8px] opacity-50 uppercase">Value</div>
                            </div>
                          </div>
                        ))}
                        {h2hData.myDiff.length === 0 && (
                          <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No unique players</div>
                        )}
                      </div>
                    </div>

                    {/* Common Players */}
                    <div className="border border-[#141414]/10 bg-white/30">
                      <div className="border-b border-[#141414]/10 p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
                        <span>Common Players</span>
                        <span className="opacity-60">{h2hData.common.length}</span>
                      </div>
                      <div className="divide-y divide-[#141414]/10">
                        {h2hData.common.map((p, i) => (
                          <div key={i} className="p-3 flex justify-between items-center">
                            <div>
                              <div className="font-bold text-sm">{p.web_name}</div>
                              <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(p.team)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold">{p.valueScore}</div>
                              <div className="text-[8px] opacity-50 uppercase">Value</div>
                            </div>
                          </div>
                        ))}
                        {h2hData.common.length === 0 && (
                          <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No common players</div>
                        )}
                      </div>
                    </div>

                    {/* Opponent Differentials */}
                    <div className="border border-[#141414]/10 bg-rose-500/5">
                      <div className="bg-[#141414] text-[#E4E3E0] p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
                        <span>Opponent Differentials</span>
                        <span className="opacity-60">{h2hData.oppDiff.length}</span>
                      </div>
                      <div className="divide-y divide-[#141414]/10">
                        {h2hData.oppDiff.map((p, i) => (
                          <div key={i} className="p-3 flex justify-between items-center bg-white/50">
                            <div>
                              <div className="font-bold text-sm">{p.web_name}</div>
                              <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(p.team)}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-rose-600">{p.valueScore}</div>
                              <div className="text-[8px] opacity-50 uppercase">Value</div>
                            </div>
                          </div>
                        ))}
                        {h2hData.oppDiff.length === 0 && (
                          <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No unique players</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Targeted Transfer Suggestions */}
                {h2hData.suggestions.length > 0 && (
                  <div>
                    <h3 className="font-serif italic text-2xl mb-8 flex items-center gap-3">
                      <TrendingUp className="w-6 h-6" /> Edge Finder
                    </h3>
                    <p className="font-mono text-xs opacity-60 mb-6">
                      Replacing your weakest differentials with these options (within your budget) gives you the highest statistical edge against their unique players in this matchup.
                    </p>
                    
                    <div className="space-y-6">
                      {h2hData.suggestions.map((suggestion, i) => (
                        <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.5fr] gap-8 items-center bg-white/50 p-6 border border-[#141414]/10">
                          {/* Out */}
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full">
                              <ArrowDownRight size={20} />
                            </div>
                            <div>
                              <div className="font-bold text-lg">{suggestion.out.web_name}</div>
                              <div className="font-mono text-[10px] opacity-50 uppercase">
                                {getTeamShortName(suggestion.out.team)} • £{(suggestion.out.now_cost / 10).toFixed(1)}m
                              </div>
                              <div className="mt-2 font-mono text-[10px] text-rose-500">
                                VALUE SCORE: {suggestion.out.valueScore}
                              </div>
                            </div>
                          </div>

                          <div className="hidden md:block text-[#141414]/20">
                            <ChevronRight size={32} />
                          </div>

                          {/* Options */}
                          <div className="space-y-3">
                            {suggestion.options.length === 0 ? (
                              <div className="font-mono text-[10px] opacity-50 italic">No better options found within budget for this position.</div>
                            ) : (
                              <>
                                {(expandedTransfers[suggestion.out.id] ? suggestion.options : suggestion.options.slice(0, 3)).map((opt: any, j: number) => (
                                  <div key={j} className="flex items-center justify-between bg-white p-3 border border-emerald-500/30 shadow-sm relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-emerald-500/5 translate-y-full group-hover:translate-y-0 transition-transform" />
                                    <div className="flex items-center gap-3 relative z-10">
                                      <div className="text-emerald-500">
                                        <ArrowUpRight size={16} />
                                      </div>
                                      <div>
                                        <div className="font-bold text-sm">{opt.web_name}</div>
                                        <div className="font-mono text-[10px] opacity-50 uppercase">
                                          {getTeamShortName(opt.team)} • £{(opt.now_cost / 10).toFixed(1)}m
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right relative z-10">
                                      <div className="font-mono text-sm font-bold text-emerald-500">+{ (opt.valueScore - suggestion.out.valueScore).toFixed(1) }</div>
                                      <div className="font-mono text-[10px] opacity-50 uppercase">Edge Gained</div>
                                    </div>
                                  </div>
                                ))}
                                {suggestion.options.length > 3 && (
                                  <button 
                                    onClick={() => setExpandedTransfers(prev => ({ ...prev, [suggestion.out.id]: !prev[suggestion.out.id] }))}
                                    className="w-full py-2 font-mono text-[10px] uppercase tracking-widest border border-emerald-500/30 bg-white/50 hover:bg-emerald-500/10 transition-colors mt-2"
                                  >
                                    {expandedTransfers[suggestion.out.id] ? "Show Less" : "Show More Edge Players"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : activeTab === "performance" ? (
          /* Performance Tab View */
          <div className="bg-[#141414] text-[#E4E3E0] border border-[#E4E3E0]/20 p-8 min-h-[600px]">
             <div className="mb-8 flex flex-col gap-2 border-b border-[#E4E3E0]/20 pb-6">
                <h3 className="font-serif italic text-4xl flex items-center gap-4 text-emerald-400">
                  <Zap size={32} /> Performance Archetypes
                </h3>
                <p className="font-mono text-xs opacity-70 tracking-widest uppercase">
                  Classifying players based on Points Per 90 gradients across fixture difficulties
                </p>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
               {["Game Raiser", "Consistent Performer", "Steady Earner", "Flat Track Bully", "Rotation Risk", "Squad Player", "Dud"].map(arch => (
                 <div key={arch} className="bg-white/5 border border-white/10 p-6">
                   <h4 className="font-serif italic text-2xl mb-4 border-b border-white/10 pb-2">{arch}</h4>
                   <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
                     {processedPlayers.filter(p => p.perfProfile?.archetype === arch).sort((a, b) => b.valueScore - a.valueScore).map(p => (
                       <div key={p.id} className="flex items-center justify-between border-b border-white/5 pb-2">
                          <div className="font-bold">{p.web_name}</div>
                          <div className="flex gap-4">
                            <span className="font-mono text-xs opacity-50 uppercase tracking-widest items-center flex gap-1">
                              Value <span className="font-bold text-emerald-400">{p.valueScore.toFixed(1)}</span>
                            </span>
                          </div>
                       </div>
                     ))}
                     {processedPlayers.filter(p => p.perfProfile?.archetype === arch).length === 0 && (
                       <div className="font-mono text-[10px] italic opacity-50">No heavily-trafficked players found in this category.</div>
                     )}
                   </div>
                 </div>
               ))}
             </div>
             
             {!isFetchingSummaries && playerSummaries && Object.keys(playerSummaries).length < players.length && (
               <div className="mt-8 font-mono text-[10px] opacity-40 text-center uppercase tracking-widest border border-white/10 p-4 inline-block mx-auto rounded">
                 Background server syncing match history... ({Object.keys(playerSummaries).length} / {players.length} players loaded)
               </div>
             )}
          </div>
        ) : null}

      </main>

      {/* Footer Info */}
      <footer className="max-w-7xl mx-auto mt-24 border-t border-[#141414] pt-8 flex flex-col md:flex-row justify-between gap-8 opacity-40 font-mono text-[10px] uppercase tracking-widest">
        <div>
          Data Source: Fantasy Premier League Official API
        </div>
        <div className="flex gap-8">
          <span>FDR: 1 (Easy) - 5 (Hard)</span>
          <span>Composite Score: Form × Fixture Ease</span>
        </div>
      </footer>
    </div>
  );
}
