import React, { useMemo, useState } from "react";
import { Sparkles, Calendar, AlertTriangle, CheckCircle2, Info, ChevronRight } from "lucide-react";
import { Team, Fixture } from "../../types";
import { getNextFixtures } from "../../utils/fixtures";

interface ChipStrategyTabProps {
  mySquad: any[];
  teams: Team[];
  fixtures: Fixture[];
  currentGW: number | null;
  fplChips: any[];
}

export const ChipStrategyTab = ({ mySquad, teams, fixtures, currentGW, fplChips }: ChipStrategyTabProps) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

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

  const handleAnalyze = async () => {
    setAnalyzing(true);
    // Simulate AI analysis or call a backend endpoint if we had one for UI.
    // Since we have the chat tool logic, we can mock a similar response here.
    setTimeout(() => {
      const dgw = squadCoverage.find(s => s.isGlobalBlank || s.dgwCount > 3);
      if (dgw) {
        setAiInsight(`A major Double/Blank window is detected in GW${dgw.gw}. You have ${dgw.dgwCount} players with doubles. Consider using your Free Hit if coverage drops below 10 for any upcoming Blank GW.`);
      } else {
        setAiInsight("Your squad coverage looks stable for the next 5 weeks. Save your chips for the larger Double Gameweeks usually occurring in GW34-37.");
      }
      setAnalyzing(false);
    }, 1500);
  };

  const getChipStatus = (name: string) => {
    const chip = fplChips?.find(c => c.name === name);
    if (!chip) return "unknown";
    return chip.status_for_entry === "played" ? "Used" : "Available";
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
                  {status}
                </div>
              </div>
              <div className={`w-3 h-3 rounded-full ${chip.color} ${status === "Used" ? "opacity-20" : "animate-pulse"}`} />
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
          
          {aiInsight ? (
            <div className="space-y-4">
              <p className="font-mono text-sm leading-relaxed opacity-80 max-w-2xl border-l-2 border-emerald-500 pl-4 py-1">
                {aiInsight}
              </p>
              <button 
                onClick={() => setAiInsight(null)}
                className="font-mono text-[10px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity"
              >
                Reset Analysis
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <p className="font-mono text-xs uppercase tracking-widest opacity-50 mb-2">Heuristic Objective</p>
                <p className="text-sm opacity-80">Analyze fixtures, team strength, and squad coverage to identify optimal chip windows.</p>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="bg-white text-black px-8 py-4 rounded-xl font-mono text-xs uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
              >
                {analyzing ? <Loader animate /> : <ChevronRight size={14} />}
                {analyzing ? "Running Simulations..." : "Calculate Optimal Path"}
              </button>
            </div>
          )}
        </div>
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
