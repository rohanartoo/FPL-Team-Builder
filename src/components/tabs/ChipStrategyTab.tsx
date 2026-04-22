import React, { useMemo, useState } from "react";
import { Sparkles, Calendar, AlertTriangle, CheckCircle2, Info, ChevronRight } from "lucide-react";
import { scoreChipWindows } from "../../utils/chipScoring";
import { Team, Fixture } from "../../types";
import { getNextFixtures } from "../../utils/fixtures";
import { RecommendationCard } from "./RecommendationCard";


interface ChipStrategyTabProps {
  mySquad: any[];
  teams: Team[];
  fixtures: Fixture[];
  currentGW: number | null;
  fplChips: any[];
  myTeamHistory: any;
}

export const ChipStrategyTab = ({ mySquad, teams, fixtures, currentGW, fplChips, myTeamHistory }: ChipStrategyTabProps) => {
  const [chipRecommendations, setChipRecommendations] = useState<any[]>([]);
  const [insight, setInsight] = useState<string>('');

  const horizon = 10;
  const gws = useMemo(() => {
    if (!currentGW) return [];
    return Array.from({ length: horizon }, (_, i) => currentGW + i).filter(gw => gw <= 38);
  }, [currentGW]);

  const squadCoverage = useMemo(() => {
    return gws.map(gw => {
      const fixturesInGw = fixtures.filter(f => f.event === gw);
      const playersWithFixture = mySquad.filter(p => {
        return fixturesInGw.some(f => f.team_h === p.team || f.team_a === p.team);
      });
      const dgwPlayers = mySquad.filter(p => {
        const count = fixturesInGw.filter(f => f.team_h === p.team || f.team_a === p.team).length;
        return count >= 2;
      });
      return {
        gw,
        count: playersWithFixture.length,
        dgwCount: dgwPlayers.length,
        isBlank: playersWithFixture.length === 0 && fixturesInGw.length > 0, // Simplified
        isGlobalBlank: fixturesInGw.length < 10 && fixturesInGw.length > 0
      };
    });
  }, [gws, mySquad, fixtures]);

  const handleAnalyze = () => {
    // Determine available chips using existing helper
    const available = ["wildcard", "freehit", "bboost", "3xc"].filter(name => getChipStatus(name) === "Available");
    const chipStatus = {
      wildcard: available.includes("wildcard"),
      freehit: available.includes("freehit"),
      benchBoost: available.includes("bboost"),
      tripleCaptain: available.includes("3xc")
    };
    // Compute recommendations using shared scoring engine
    const recommendations = scoreChipWindows({
      squad: mySquad,
      fixtures,
      chipStatus,
      currentGw: currentGW || 0,
      horizon: 6
    });
    setChipRecommendations(recommendations);
    // Simple textual insight summarizing top recommendations
    if (recommendations.length) {
      const lines = recommendations.map(rec => `${rec.chip}: GW${rec.bestGw}`).join(" | ");
      setInsight(`Top chip windows – ${lines}`);
    } else {
      setInsight("No chip recommendations available.");
    }
  };

  // Returns chip availability using the same logic as MyTeamTab:
  // filter over ALL matching chip definitions (wildcard has two entries —
  // first half and second half) and check if any window is still open and unplayed.
  const getChipStatus = (name: string): "Available" | "Used" | "no-squad" => {
    if (!myTeamHistory) return "no-squad";
    const playedChips: any[] = myTeamHistory.chips ?? [];
    const chipDefs = fplChips?.filter((c: any) => c.name === name) ?? [];
    if (chipDefs.length === 0) return "Used";
    const isAvailable = chipDefs.some((def: any) => {
      if (currentGW && def.stop_event && currentGW > def.stop_event) return false;
      const isPlayed = playedChips.some(
        (p: any) => p.name === name && p.event >= def.start_event && p.event <= def.stop_event
      );
      return !isPlayed;
    });
    return isAvailable ? "Available" : "Used";
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header & Chips Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { name: "wildcard", label: "Wildcard", color: "bg-blue-500" },
          { name: "freehit", label: "Free Hit", color: "bg-emerald-500" },
          { name: "bboost", label: "Bench Boost", color: "bg-purple-500" },
          { name: "3xc", label: "Triple Captain", color: "bg-amber-500" }
        ].map(chip => {
          const status = getChipStatus(chip.name);
          return (
            <div key={chip.name} className="bg-[#141414]/5 border border-[#141414]/10 p-4 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-widest opacity-40 mb-1">{chip.label}</div>
                <div className={`font-serif italic text-lg ${status === "Available" ? "text-[#141414]" : "opacity-30 line-through"}`}>
                  {status === "no-squad" ? "—" : status}
                </div>
                {status === "no-squad" && (
                  <div className="font-mono text-[8px] opacity-40 mt-1">Load squad</div>
                )}
              </div>
              <div className={`w-3 h-3 rounded-full ${chip.color} ${status === "Available" ? "animate-pulse" : "opacity-20"}`} />
            </div>
          );
        })}
      </div>

      {/* AI Strategy Panel */}
      <div className="bg-[#141414] text-[#E4E3E0] p-8 rounded-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[100px] rounded-full -mr-32 -mt-32" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-emerald-500/20 p-2 rounded-lg">
              <Sparkles className="text-emerald-400 w-5 h-5" />
            </div>
            <h2 className="font-serif italic text-2xl">AI Strategy Consultant</h2>
          </div>
          
          {insight ? (
                <div className="space-y-4">
                  <p className="font-mono text-sm leading-relaxed opacity-80 max-w-2xl border-l-2 border-emerald-500 pl-4 py-1">
                    {insight}
                  </p>
                  <button 
                    onClick={() => setInsight('')}
                    className="font-mono text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
                  >
                    Reset
                  </button>
                </div>
            ) : (
                <button
                  onClick={handleAnalyze}
                  className="bg-white text-black px-8 py-4 rounded-xl font-mono text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                >
                  <ChevronRight size={14} />
                  Calculate Chip Recommendations
                </button>
            )}
                
            {chipRecommendations.length > 0 && (
                <div className="mt-6 space-y-4 grid gap-4 md:grid-cols-2">
                  {chipRecommendations.map((rec, idx) => (
                    <RecommendationCard key={idx} rec={rec} />
                  ))}
                </div>
              )}        </div>
      </div>

      {/* Timeline Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="opacity-40" />
            <h3 className="font-mono text-xs uppercase tracking-widest">Planning Horizon (10 Weeks)</h3>
          </div>
          <div className="flex gap-4 font-mono text-[9px] uppercase tracking-widest opacity-40">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Full Squad</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> DGW Potential</div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500" /> Blank Risk</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {squadCoverage.map(s => {
            const isDanger = s.count < 11;
            const isDGW = s.isGlobalBlank || s.dgwCount > 0;
            
            return (
              <div 
                key={s.gw}
                className={`p-5 rounded-2xl border transition-all hover:translate-y-[-4px] cursor-default
                  ${isDanger ? 'bg-rose-50 border-rose-100' : 'bg-white border-[#141414]/5'}
                  ${s.gw === currentGW ? 'ring-2 ring-emerald-500 ring-offset-4 ring-offset-[#E4E3E0]' : ''}`}
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="font-serif italic text-3xl">GW{s.gw}</div>
                  {s.gw === currentGW && (
                    <div className="bg-emerald-500 text-white font-mono text-[8px] px-2 py-0.5 rounded-full uppercase tracking-widest">Active</div>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="font-mono text-[9px] uppercase tracking-widest opacity-40 mb-1">Squad Coverage</div>
                    <div className="flex items-end gap-1">
                      <span className={`text-2xl font-mono ${isDanger ? 'text-rose-600' : 'text-[#141414]'}`}>{s.count}</span>
                      <span className="text-sm opacity-20 mb-1">/ 15</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {s.isGlobalBlank ? (
                      <div className="flex items-center gap-1 text-rose-600 bg-rose-100 px-2 py-1 rounded-md">
                        <AlertTriangle size={12} />
                        <span className="font-mono text-[9px] uppercase tracking-widest">Blank GW</span>
                      </div>
                    ) : s.dgwCount > 0 ? (
                      <div className="flex items-center gap-1 text-amber-600 bg-amber-100 px-2 py-1 rounded-md">
                        < Sparkles size={12} />
                        <span className="font-mono text-[9px] uppercase tracking-widest">+{s.dgwCount} Doubles</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md">
                        <CheckCircle2 size={12} />
                        <span className="font-mono text-[9px] uppercase tracking-widest">Normal</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/10 p-6 rounded-2xl flex gap-4 items-start">
        <Info className="text-blue-500 w-5 h-5 mt-0.5 shrink-0" />
        <div className="text-xs font-mono leading-relaxed opacity-60">
          <p className="mb-2">Strategy Note: This simulation assumes your current squad remains unchanged. Transfer activity will impact future coverage scores. Re-run analysis after confirming transfers.</p>
          <p>Dates and fixture assignments for GW30 onwards are subject to TV scheduling and Cup postponements.</p>
        </div>
      </div>
    </div>
  );
};

const Loader = ({ animate }: { animate?: boolean }) => (
  <div className={`w-3 h-3 border-2 border-black/20 border-t-black rounded-full ${animate ? 'animate-spin' : ''}`} />
);
