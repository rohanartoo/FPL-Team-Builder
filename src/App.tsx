import React, { useState, useMemo, Suspense, lazy } from "react";
import {
  Users,
  BarChart2,
  Calendar,
  BookOpen,
  Target,
  GitCompare,
  Loader2,
  AlertCircle
} from "lucide-react";

// Types
import { POSITION_MAP } from "./types";

// Utilities
import { calculateAvgDifficulty, getNextFixtures } from "./utils/fixtures";

// Hooks
import { useFPLData } from "./hooks/useFPLData";
import { useMyTeam } from "./hooks/useMyTeam";
import { useH2H } from "./hooks/useH2H";
import { calculateLast5Metrics, getFDRColor, getAvailabilityMultiplier } from "./utils/player";
import { calculatePerformanceProfile, blendPerformanceWithPrior } from "./utils/metrics";
import { getTeamShortName, getTeamName } from "./utils/team";

// Components
import { PlayerListTab } from "./components/tabs/PlayerListTab";
import { ChatWidget, TeamContext } from "./components/ChatWidget";
const VisualizationTab = lazy(() => import("./components/tabs/VisualizationTab").then(m => ({ default: m.VisualizationTab })));
const TeamScheduleTab = lazy(() => import("./components/tabs/TeamScheduleTab").then(m => ({ default: m.TeamScheduleTab })));
const MatchCentreTab = lazy(() => import("./components/tabs/MatchCentreTab").then(m => ({ default: m.MatchCentreTab })));
const MethodologyTab = lazy(() => import("./components/tabs/MethodologyTab").then(m => ({ default: m.MethodologyTab })));
const CompareTab = lazy(() => import("./components/tabs/CompareTab").then(m => ({ default: m.CompareTab })));

const App = () => {
  const [activeTab, setActiveTab] = useState("players");
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'valueScore',
    direction: 'desc'
  });
  const [positionFilter, setPositionFilter] = useState<number>(0);
  const [comparePlayerIds, setComparePlayerIds] = useState<[number | null, number | null]>([null, null]);

  async function handleForceSync() {
    if (syncTriggered) return;
    const res = await fetch("/api/admin/force-sync", { method: "POST" });
    const data = await res.json();
    if (data.status === "sync_started" || data.status === "already_syncing") {
      setSyncTriggered(true);
      setTimeout(() => setSyncTriggered(false), 5000);
    }
  }

  // Core Data Hook
  const {
    players,
    teams,
    fixtures,
    currentGW,
    loading,
    syncProgress,
    apiError,
    playerSummaries,
    isSyncing,
    tfdrMap,
    fetchPlayerSummary,
    isEarlySeason,
    seasonPriors,
    injuryPeriods,
    fplChips
  } = useFPLData();

  // My Team Hook
  const myTeam = useMyTeam(
    players,
    teams,
    fixtures,
    playerSummaries,
    currentGW,
    tfdrMap,
    fetchPlayerSummary,
    seasonPriors
  );

  // H2H Hook
  const h2h = useH2H(
    players,
    teams,
    fixtures,
    playerSummaries,
    currentGW,
    tfdrMap,
    fetchPlayerSummary,
    myTeam.mySquad,
    myTeam.myTeamInfo,
    myTeam.numTransfers,
    seasonPriors
  );

  const fetchH2H = async (myId: string, oppId: string) => {
    try {
      myTeam.setMyTeamLoading(true);
      h2h.setOpponentLoading(true);
      myTeam.setMyTeamError(null);

      const [m, o] = await Promise.all([
        h2h.fetchTeamData(myId, false),
        h2h.fetchTeamData(oppId, true)
      ]);

      if (m) {
        myTeam.setMyTeamInfo(m.entryData);
        myTeam.setMySquad(m.enrichedSquad);
        myTeam.setMyTeamHistory(m.historyData);
      }
    } catch (err: any) {
      myTeam.setMyTeamError(err.message);
    } finally {
      myTeam.setMyTeamLoading(false);
      h2h.setOpponentLoading(false);
    }
  };

  const globalPerformanceRoster = useMemo(() => {
    return players.map(p => {
      const summary = playerSummaries[p.id];
      const metrics = calculateLast5Metrics(summary, p.status);
      const nextFixtures = getNextFixtures(p.team, fixtures, teams, tfdrMap, 5, 0, p.element_type);
      const fdr = nextFixtures.length > 0
        ? parseFloat((nextFixtures.reduce((s, f) => s + f.difficulty, 0) / nextFixtures.length).toFixed(2))
        : 3;
      const qualityScore = summary ? metrics.points : parseFloat(p.form);
      const fplForm = parseFloat(p.form);
      let perfProfile = summary ? calculatePerformanceProfile(summary.history, fixtures, tfdrMap, p.status, 3, 270, p.element_type, p, injuryPeriods?.players[p.id]) : null;

      // Blend with prior-season data (decays automatically based on current appearances)
      if (perfProfile && seasonPriors?.players?.[p.id]) {
        perfProfile = blendPerformanceWithPrior(perfProfile, seasonPriors.players[p.id], p.team);
      }

      const hasReliableProfile = perfProfile && (perfProfile.appearances > 0 || perfProfile.base_pp90 > 0);

      const availabilityMultiplier = getAvailabilityMultiplier(p);

      // Last-resort fallback: use price as PP90 proxy when no form/performance data exists (pre-GW1)
      const priceEstimate = p.now_cost / 20;
      const fallback = perfProfile?.base_pp90 ?? (qualityScore || priceEstimate);
      const pp90AtDifficulty = (d: number): number => {
        const key = Math.round(Math.max(2, Math.min(5, d))) as 2 | 3 | 4 | 5;
        const map: Record<2 | 3 | 4 | 5, number | null> = {
          2: perfProfile?.pp90_fdr2 ?? null,
          3: perfProfile?.pp90_fdr3 ?? null,
          4: perfProfile?.pp90_fdr4 ?? null,
          5: perfProfile?.pp90_fdr5 ?? null,
        };
        return map[key] ?? fallback;
      };

      let xPts5GW = 0;
      for (const fix of nextFixtures) {
        if (fix.isBlank) continue;
        const pts = pp90AtDifficulty(fix.difficulty);
        xPts5GW += fix.isDouble ? pts * 2 : pts;
      }

      // Use fit_reliability_score (injury-adjusted) when player is currently available.
      // This prevents injury absences from suppressing the value of a player who is nailed-on when fit.
      const reliability = hasReliableProfile
        ? (p.status === 'a'
            ? Math.max(perfProfile!.fit_reliability_score, perfProfile!.reliability_score)
            : perfProfile!.reliability_score)
        : 1;

      // Basement Floor: 25% weight on season-long PPG (falls back to price estimate pre-season)
      const seasonPPG = parseFloat(p.points_per_game) || priceEstimate;
      const ppgFloor = seasonPPG * 5; // Theoretical floor over 5 games

      // xGI-adjusted basement floor (Phase 3): blend PPG floor with xG-derived floor
      // to reduce noise from hot/cold streaks in actual points.
      // Only applied when player has 270+ mins (3 full games of data).
      const hasXGData = (p.minutes ?? 0) >= 270;
      let basementFloor = ppgFloor;

      if (hasXGData) {
        if (p.element_type === 3 || p.element_type === 4) {
          // MID/FWD: blend with xGI-derived FPL point expectation per 90
          const goalPts = p.element_type === 3 ? 5 : 4;
          const xGIpp90 = (p.expected_goals_per_90 ?? 0) * goalPts +
                          (p.expected_assists_per_90 ?? 0) * 3;
          const xBaseline = xGIpp90 * 5; // over 5 gameweeks
          // 50/50 blend: stabilises hot-streak inflation and cold-streak deflation
          basementFloor = (ppgFloor * 0.5) + (xBaseline * 0.5);
        } else if (p.element_type === 1 || p.element_type === 2) {
          // GK/DEF: modulate floor by xGC/90 vs league average (1.15)
          // Lower xGC → better CS prospects → boost; higher xGC → slight penalty
          const LEAGUE_AVG_XGC90 = 1.15;
          const xGC90 = p.expected_goals_conceded_per_90 ?? LEAGUE_AVG_XGC90;
          const xGCModifier = Math.max(0.8, Math.min(1.2, 1 + (LEAGUE_AVG_XGC90 - xGC90) / LEAGUE_AVG_XGC90 * 0.3));
          basementFloor = ppgFloor * xGCModifier;
        }
      }

      // Weighted Score: 75% short-term xPts (fixture-adjusted), 25% long-term floor
      const weightedScore = (xPts5GW * 0.75) + (basementFloor * 0.25);
      const valueScore = parseFloat((weightedScore * reliability * availabilityMultiplier).toFixed(2));
      const valueEfficiency = parseFloat((valueScore / (p.now_cost / 10)).toFixed(2));

      return {
        ...p,
        fdr,
        fplForm,
        qualityScore,
        valueScore,
        valueEfficiency,
        metrics,
        perfProfile
      };
    });
  }, [players, playerSummaries, fixtures, teams, tfdrMap, seasonPriors]);

  const processedPlayers = useMemo(() => {
    let result = globalPerformanceRoster.filter(p => {
      const matchesSearch = p.web_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teams.find(t => t.id === p.team)?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPosition = positionFilter === 0 || p.element_type === positionFilter;
      return matchesSearch && matchesPosition;
    });

    result.sort((a: any, b: any) => {
      let aVal = a, bVal = b;
      sortConfig.key.split('.').forEach(k => { aVal = aVal?.[k]; bVal = bVal?.[k]; });
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [globalPerformanceRoster, searchQuery, sortConfig, teams, positionFilter]);

  const teamScheduleData = useMemo(() => {
    return teams.map(t => {
      const immediate3Avg = calculateAvgDifficulty(t.id, fixtures, teams, tfdrMap, 3, 0);
      const next5Avg = calculateAvgDifficulty(t.id, fixtures, teams, tfdrMap, 5, 0);

      return {
        ...t,
        next5Avg,
        trend: parseFloat((immediate3Avg - next5Avg).toFixed(2)),
        fixtures: getNextFixtures(t.id, fixtures, teams, tfdrMap, 5)
      };
    }).sort((a, b) => a.next5Avg - b.next5Avg);
  }, [teams, fixtures, tfdrMap]);


  const teamContext = useMemo((): TeamContext | null => {
    if (!myTeam.myTeamInfo || !myTeam.mySquad.length) return null;
    const posMap: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };
    return {
      teamName: myTeam.myTeamInfo.name,
      budget: (myTeam.myTeamInfo.last_deadline_bank ?? 0) / 10,
      freeTransfers: myTeam.myTeamInfo.transfers_balance ?? 1,
      overallRank: myTeam.myTeamInfo.summary_overall_rank ?? null,
      totalPoints: myTeam.myTeamInfo.summary_overall_points ?? 0,
      squad: myTeam.mySquad.map((p: any) => ({
        name: p.web_name,
        team: teams.find((t: any) => t.id === p.team)?.short_name ?? String(p.team),
        position: posMap[p.element_type] ?? "UNK",
        price: (p.now_cost ?? 0) / 10,
        is_captain: p.is_captain ?? false,
        is_vice_captain: p.is_vice_captain ?? false,
        form: p.form ?? "0",
        total_points: p.total_points ?? 0,
        chance_of_playing: p.chance_of_playing_next_round ?? null,
        status: p.status ?? "a",
        news: p.news ?? "",
        fdr: p.fdr ?? 3
      }))
    };
  }, [myTeam.myTeamInfo, myTeam.mySquad, teams]);

  if (loading && !Object.keys(playerSummaries).length) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-8 text-[#141414]">
        <Loader2 className="w-12 h-12 animate-spin mb-6 opacity-20" />
        <h1 className="font-serif italic text-4xl mb-2">Initializing Profiler</h1>
        <p className="font-mono text-xs uppercase tracking-widest opacity-40">Syncing with FPL Global Data...</p>
      </div>
    );
  }

  if (apiError) {
    return (
      <div className="min-h-screen bg-[#E4E3E0] flex flex-col items-center justify-center p-8 text-[#141414]">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-6" />
        <h1 className="font-serif italic text-4xl mb-2">Connection Error</h1>
        <p className="font-mono text-sm uppercase tracking-widest bg-rose-500/10 border border-rose-500/20 px-4 py-2 text-rose-600 max-w-md text-center">{apiError}</p>
        <button onClick={() => window.location.reload()} className="mt-8 font-mono text-xs uppercase tracking-widest border border-[#141414] px-6 py-3 hover:bg-[#141414] hover:text-[#E4E3E0] transition-all">Retry Connection</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#E4E3E0] text-[#141414] selection:bg-[#141414] selection:text-[#E4E3E0]">
      {/* Navigation */}
      <nav className="border-b border-[#141414] px-4 md:px-8 py-6 sticky top-0 bg-[#E4E3E0]/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <h1 className="text-3xl font-serif italic tracking-tighter leading-none mb-1">Player Profiler</h1>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-40">FPL Strategic Intelligence</div>
          </div>
          <div className="flex justify-center gap-0.5 overflow-x-auto">
            {[
              { id: 'players', label: 'Player List', icon: Users },
              { id: 'compare', label: 'Compare', icon: GitCompare },
              { id: 'matchcentre', label: 'Match Centre', icon: Target },
              { id: 'schedule', label: 'Schedules', icon: Calendar },
              { id: 'viz', label: 'Visualization', icon: BarChart2 },
              { id: 'methodology', label: 'Methodology', icon: BookOpen }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-all
                  ${activeTab === tab.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10 opacity-60'}`}
              >
                <tab.icon size={12} />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Sync Bar */}
      {isSyncing && (
        <div className="bg-[#141414] text-[#E4E3E0] py-1 px-4 overflow-hidden relative">
          <div
            className="absolute inset-0 bg-emerald-500/20 transition-all duration-1000"
            style={{ width: `${(syncProgress.loaded / syncProgress.total) * 100}%` }}
          />
          <div className="max-w-7xl mx-auto relative z-10 font-mono text-[9px] uppercase tracking-[0.2em] flex justify-between items-center">
            <span>Server Syncing Historical Data...</span>
            <span>{syncProgress.loaded} / {syncProgress.total} Players Analyzed</span>
          </div>
        </div>
      )}

      {/* Early Season Banner */}
      {isEarlySeason && !isSyncing && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 py-2 px-4">
          <div className="max-w-7xl mx-auto font-mono text-[10px] uppercase tracking-[0.15em] text-amber-700 flex items-center gap-2">
            <AlertCircle size={12} />
            <span>Early Season Mode — Blending prior-season data with live results. Fully organic by ~GW8.</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-12">
        <Suspense fallback={
          <div className="flex flex-col items-center justify-center p-20 opacity-20">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Loading Module...</span>
          </div>
        }>
          {activeTab === 'players' && (
            <PlayerListTab
              processedPlayers={processedPlayers}
              sortConfig={sortConfig}
              setSortConfig={setSortConfig}
              expandedPlayer={expandedPlayer}
              setExpandedPlayer={setExpandedPlayer}
              fetchPlayerSummary={fetchPlayerSummary}
              playerSummaries={playerSummaries}
              fixtures={fixtures}
              teams={teams}
              tfdrMap={tfdrMap}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              positionFilter={positionFilter}
              setPositionFilter={setPositionFilter}
              currentGW={currentGW}
              onCompare={(id: number) => {
                setComparePlayerIds(comparePlayerIds[0] === null ? [id, null] : [comparePlayerIds[0], id]);
                setActiveTab('compare');
              }}
            />
          )}
          {activeTab === 'compare' && (
            <CompareTab
              processedPlayers={globalPerformanceRoster}
              comparePlayerIds={comparePlayerIds}
              setComparePlayerIds={setComparePlayerIds}
              playerSummaries={playerSummaries}
              fetchPlayerSummary={fetchPlayerSummary}
              fixtures={fixtures}
              teams={teams}
              tfdrMap={tfdrMap}
              currentGW={currentGW}
            />
          )}
          {activeTab === 'viz' && <VisualizationTab
            vizData={globalPerformanceRoster.filter(p => (p.perfProfile?.base_pp90 || 0) > 0).map(p => ({
              id: p.id,
              name: p.web_name,
              team: getTeamShortName(teams, p.team),
              teamFull: getTeamName(teams, p.team),
              pos: p.element_type,
              price: p.now_cost / 10,
              valueScore: p.valueScore,
              reliability: p.perfProfile?.reliability_score ?? 0,
              archetype: p.perfProfile?.archetype ?? "Not Enough Data",
              base_pp90: p.perfProfile?.base_pp90 ?? 0,
              ownership: p.selected_by_percent,
              pp90_fdr2: p.perfProfile?.pp90_fdr2 ?? null,
              pp90_fdr3: p.perfProfile?.pp90_fdr3 ?? null,
              pp90_fdr4: p.perfProfile?.pp90_fdr4 ?? null,
              pp90_fdr5: p.perfProfile?.pp90_fdr5 ?? null,
              recentGWPoints: (() => {
                const hist = playerSummaries[p.id]?.history ?? [];
                return hist.slice(-10).map((h: any) => ({ gw: h.round, pts: h.total_points }));
              })(),
            }))}
            onPlayerClick={(id) => {
              setComparePlayerIds([id, null]);
              setActiveTab('compare');
            }}
          />}
          {activeTab === 'schedule' && <TeamScheduleTab fixtures={fixtures} teams={teams} tfdrMap={tfdrMap} />}
          {activeTab === 'matchcentre' && (
            <MatchCentreTab
              {...myTeam}
              {...h2h}
              fetchH2H={fetchH2H}
              teams={teams}
              fplChips={fplChips}
              currentGW={currentGW}
            />
          )}
          {activeTab === 'methodology' && <MethodologyTab />}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#141414]/10 p-8 mt-20 opacity-30 hover:opacity-100 transition-opacity">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 font-mono text-[9px] uppercase tracking-[0.2em]">
          <div>Data Source: Official FPL API</div>
          <div>© 2026 Player Profiler Tactical Suite</div>
          <div className="flex gap-4">
            <span
              className="text-emerald-600 cursor-default select-none"
              onDoubleClick={handleForceSync}
              title=""
            >
              {syncTriggered ? "Engine: Syncing..." : "Engine: TFDR v2.1"}
            </span>
            <span>Current GW: {currentGW || '—'}</span>
          </div>
        </div>
      </footer>
      <ChatWidget teamId={myTeam.myTeamInfo?.id ? String(myTeam.myTeamInfo.id) : null} teamContext={teamContext} />
    </div>
  );
};

export default App;
