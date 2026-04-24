import { useState, useMemo, Suspense, lazy, useEffect } from "react";
import {
  Users,
  BarChart2,
  Calendar,
  Target,
  GitCompare,
  Loader2,
  AlertCircle,
  HelpCircle,
  X
} from "lucide-react";

// Hooks
import { useFPLData } from "./hooks/useFPLData";
import { useMyTeam } from "./hooks/useMyTeam";
import { useGlobalPerformanceRoster } from "./hooks/useGlobalPerformanceRoster";
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
  const [showMethodology, setShowMethodology] = useState(false);
  const [teamFilter, setTeamFilter] = useState<number | null>(null);
  const [syncTriggered, setSyncTriggered] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowMethodology(false); };
    if (showMethodology) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMethodology]);
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


  const globalPerformanceRoster = useGlobalPerformanceRoster(
    players, playerSummaries, fixtures, teams, tfdrMap, seasonPriors, injuryPeriods
  );

  const processedPlayers = useMemo(() => {
    let result = globalPerformanceRoster.filter(p => {
      const matchesSearch = p.web_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        teams.find(t => t.id === p.team)?.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPosition = positionFilter === 0 || p.element_type === positionFilter;
      const matchesTeam = teamFilter === null || p.team === teamFilter;
      return matchesSearch && matchesPosition && matchesTeam;
    });

    result.sort((a: any, b: any) => {
      let aVal = a, bVal = b;
      sortConfig.key.split('.').forEach(k => { aVal = aVal?.[k]; bVal = bVal?.[k]; });
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [globalPerformanceRoster, searchQuery, sortConfig, teams, positionFilter, teamFilter]);



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
            <button
              onClick={() => setShowMethodology(true)}
              className="flex items-center gap-1 px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition-all hover:bg-[#141414]/10 opacity-60 hover:opacity-100"
              title="How this works"
            >
              <HelpCircle size={12} />
              <span className="hidden sm:inline">?</span>
            </button>
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
              teamFilter={teamFilter}
              setTeamFilter={setTeamFilter}
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
            }))}
            onPlayerClick={(id) => {
              setComparePlayerIds([id, null]);
              setActiveTab('compare');
            }}
          />}
          {activeTab === 'schedule' && <TeamScheduleTab
            fixtures={fixtures}
            teams={teams}
            tfdrMap={tfdrMap}
            onTeamClick={(teamId) => {
              setTeamFilter(teamId);
              setActiveTab('players');
            }}
          />}
          {activeTab === 'matchcentre' && (
            <MatchCentreTab
              {...myTeam}
              teams={teams}
              fixtures={fixtures}
              fplChips={fplChips}
              currentGW={currentGW}
            />
          )}
        </Suspense>
      </main>

      {/* Methodology Modal */}
      {showMethodology && (
        <div
          className="fixed inset-0 bg-[#141414]/60 backdrop-blur-sm z-[60] overflow-y-auto px-4 py-8 md:px-8"
          onClick={e => e.target === e.currentTarget && setShowMethodology(false)}
        >
          <div className="relative bg-[#E4E3E0] w-full max-w-4xl mx-auto border border-[#141414]">
            <div className="sticky top-0 bg-[#E4E3E0] border-b border-[#141414] px-6 py-4 flex justify-between items-center z-10">
              <div>
                <h2 className="font-serif italic text-2xl leading-none">Methodology</h2>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-40 mt-1">How the scoring system works</p>
              </div>
              <button
                onClick={() => setShowMethodology(false)}
                className="p-2 hover:bg-[#141414]/10 transition-all"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <Suspense fallback={
              <div className="flex items-center justify-center p-20 opacity-20">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            }>
              <MethodologyTab />
            </Suspense>
          </div>
        </div>
      )}

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
      <ChatWidget teamId={myTeam.myTeamInfo?.id ? String(myTeam.myTeamInfo.id) : null} teamContext={teamContext} currentGW={currentGW} />
    </div>
  );
};

export default App;
