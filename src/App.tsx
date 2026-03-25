import React, { useState, useMemo, Suspense, lazy } from "react";
import {
  Users,
  BarChart2,
  Calendar,
  Zap,
  BookOpen,
  PieChart,
  Swords,
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
import { calculateLast5Metrics, calculateEaseForMath, getFDRColor } from "./utils/player";
import { calculateFDR } from "./utils/fixtures";
import { calculatePerformanceProfile } from "./utils/metrics";
import { getTeamShortName, getTeamName } from "./utils/team";

// Components
import { PlayerListTab } from "./components/tabs/PlayerListTab";
import { ArchetypesTab } from "./components/tabs/ArchetypesTab";
const VisualizationTab = lazy(() => import("./components/tabs/VisualizationTab").then(m => ({ default: m.VisualizationTab })));
const TeamScheduleTab = lazy(() => import("./components/tabs/TeamScheduleTab").then(m => ({ default: m.TeamScheduleTab })));
const MyTeamTab = lazy(() => import("./components/tabs/MyTeamTab").then(m => ({ default: m.MyTeamTab })));
const H2HMatchupTab = lazy(() => import("./components/tabs/H2HMatchupTab").then(m => ({ default: m.H2HMatchupTab })));
const MethodologyTab = lazy(() => import("./components/tabs/MethodologyTab").then(m => ({ default: m.MethodologyTab })));

const App = () => {
  const [activeTab, setActiveTab] = useState("players");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'valueScore',
    direction: 'desc'
  });
  const [positionFilter, setPositionFilter] = useState<number>(0);

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
    fetchPlayerSummary
  } = useFPLData();

  // My Team Hook
  const myTeam = useMyTeam(
    players,
    teams,
    fixtures,
    playerSummaries,
    currentGW,
    tfdrMap,
    fetchPlayerSummary
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
    myTeam.numTransfers
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
        metrics,
        perfProfile
      };
    });
  }, [players, playerSummaries, fixtures, teams, tfdrMap]);

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
          <div className="flex flex-wrap justify-center gap-1 md:gap-2">
            {[
              { id: 'players', label: 'Player List', icon: Users },
              { id: 'archetypes', label: 'Archetypes', icon: Zap },
              { id: 'viz', label: 'Visualization', icon: BarChart2 },
              { id: 'schedule', label: 'Schedules', icon: Calendar },
              { id: 'myteam', label: 'My Team', icon: PieChart },
              { id: 'h2h', label: 'H2H Matchup', icon: Swords },
              { id: 'methodology', label: 'Methodology', icon: BookOpen }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 font-mono text-[10px] uppercase tracking-widest transition-all
                  ${activeTab === tab.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5 opacity-60'}`}
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
            />
          )}
          {activeTab === 'archetypes' && (
            <ArchetypesTab
              globalPerformanceRoster={globalPerformanceRoster}
              isFetchingSummaries={isSyncing}
              playerSummaries={playerSummaries}
              players={players}
            />
          )}
          {activeTab === 'viz' && <VisualizationTab vizData={globalPerformanceRoster.filter(p => (p.perfProfile?.appearances || 0) > 0).map(p => ({
            name: p.web_name,
            team: getTeamShortName(teams, p.team),
            form: p.realForm,
            ease: p.fixtureEase,
            points: p.total_points,
            pos: p.element_type
          }))} />}
          {activeTab === 'schedule' && <TeamScheduleTab teamScheduleData={teamScheduleData} />}
          {activeTab === 'myteam' && (
            <MyTeamTab
              {...myTeam}
              teams={teams}
            />
          )}
          {activeTab === 'h2h' && (
            <H2HMatchupTab
              {...h2h}
              myTeamId={myTeam.myTeamId}
              setMyTeamId={myTeam.setMyTeamId}
              myTeamLoading={myTeam.myTeamLoading}
              myTeamError={myTeam.myTeamError}
              myTeamInfo={myTeam.myTeamInfo}
              myTeamHistory={myTeam.myTeamHistory}
              expandedTransfers={myTeam.expandedTransfers}
              setExpandedTransfers={myTeam.setExpandedTransfers}
              fetchH2H={fetchH2H}
              teams={teams}
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
            <span className="text-emerald-600">Engine: TFDR v2.1</span>
            <span>Current GW: {currentGW || '—'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
