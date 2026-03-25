import { TrendingUp, ArrowDownRight, ArrowUpRight, ChevronRight, Lock, Unlock } from "lucide-react";
import { getTeamShortName } from "../../utils/team";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { Team } from "../../types";

interface MyTeamTabProps {
  myTeamId: string;
  setMyTeamId: (id: string) => void;
  fetchMyTeam: (id: string) => void;
  myTeamLoading: boolean;
  mySquad: any[];
  numTransfers: number;
  setNumTransfers: (num: number) => void;
  myTeamError: string | null;
  myTeamInfo: any;
  myTeamHistory: any;
  transferSuggestions: any[];
  expandedTransfers: Record<string, boolean>;
  setExpandedTransfers: any;
  excludedPlayerIds: Set<number>;
  toggleExcludePlayer: (id: number) => void;
  teams: Team[];
}

export const MyTeamTab = ({
  myTeamId,
  setMyTeamId,
  fetchMyTeam,
  myTeamLoading,
  mySquad,
  numTransfers,
  setNumTransfers,
  myTeamError,
  myTeamInfo,
  myTeamHistory,
  transferSuggestions,
  expandedTransfers,
  setExpandedTransfers,
  excludedPlayerIds,
  toggleExcludePlayer,
  teams
}: MyTeamTabProps) => {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-12 text-center">
        <h2 className="font-serif italic text-4xl mb-4">Squad Analysis</h2>
        <p className="font-mono text-xs opacity-50 uppercase tracking-widest">
          Enter your FPL Team ID to identify weak links and transfer targets
        </p>

        <div className="mt-8 flex flex-col items-center gap-6">
          <div className="flex flex-col md:flex-row gap-4 justify-center w-full max-w-md">
            <input
              type="text"
              value={myTeamId}
              onChange={(e) => setMyTeamId(e.target.value)}
              placeholder="TEAM ID (e.g. 123456)"
              className="bg-transparent border border-[#141414] px-4 py-3 font-mono text-sm focus:outline-none w-full"
            />
            <button
              onClick={() => fetchMyTeam(myTeamId)}
              disabled={myTeamLoading}
              className="bg-[#141414] text-[#E4E3E0] px-8 py-3 font-mono text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50 shrink-0"
            >
              {myTeamLoading ? "Syncing..." : "Analyze Squad"}
            </button>
          </div>

          {mySquad.length > 0 && (
            <div className="bg-white/50 p-4 border border-[#141414]/10 w-full max-w-sm mx-auto">
              <div className="flex justify-between items-center mb-4">
                <span className="font-mono text-[9px] uppercase opacity-50 tracking-[0.2em]">Select transfer targets</span>
                <span className="font-mono text-[10px] font-bold bg-[#141414] text-[#E4E3E0] px-2 py-0.5">TOP {numTransfers}</span>
              </div>
              <div className="px-1">
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="1"
                  value={numTransfers}
                  onChange={(e) => setNumTransfers(parseInt(e.target.value))}
                  className="w-full h-0.5 bg-[#141414]/10 appearance-none cursor-pointer accent-[#141414] hover:accent-black transition-all"
                  style={{
                    WebkitAppearance: 'none',
                    background: `linear-gradient(to right, #141414 ${(numTransfers - 1) / 14 * 100}%, #14141410 ${(numTransfers - 1) / 14 * 100}%)`
                  }}
                />
                <div className="relative h-4 mt-2 font-mono text-[8px] opacity-40">
                  <div className="absolute left-0 top-0 flex flex-col items-center">
                    <div className="w-px h-0.5 bg-[#141414]"></div>
                    <span className="mt-1">1</span>
                  </div>
                  <div className="absolute top-0 flex flex-col items-center" style={{ left: '28.6%', transform: 'translateX(-50%)' }}>
                    <div className="w-px h-0.5 bg-[#141414]"></div>
                    <span className="mt-1">5</span>
                  </div>
                  <div className="absolute top-0 flex flex-col items-center" style={{ left: '64.3%', transform: 'translateX(-50%)' }}>
                    <div className="w-px h-0.5 bg-[#141414]"></div>
                    <span className="mt-1">10</span>
                  </div>
                  <div className="absolute right-0 top-0 flex flex-col items-center">
                    <div className="w-px h-0.5 bg-[#141414]"></div>
                    <span className="mt-1">15</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-[8px] font-mono opacity-30 uppercase tracking-tighter text-center italic">
                Tip: Lock players in the metrics table below to exclude them from transfer analysis
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
                      <div className="font-bold text-lg flex items-center">{suggestion.out.web_name} <PlayerAvailabilityIcon player={suggestion.out} /></div>
                      <div className="font-mono text-[10px] opacity-50 uppercase">
                        {getTeamShortName(teams, suggestion.out.team)} • £{(suggestion.out.now_cost / 10).toFixed(1)}m
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
                                <div className="font-bold text-sm flex items-center">{opt.web_name} <PlayerAvailabilityIcon player={opt} /></div>
                                <div className="font-mono text-[10px] opacity-50 uppercase">
                                  {getTeamShortName(teams, opt.team)} • £{(opt.now_cost / 10).toFixed(1)}m
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-sm font-bold text-emerald-500">+{(opt.valueScore - suggestion.out.valueScore).toFixed(1)}</div>
                              <div className="font-mono text-[10px] opacity-50 uppercase">Value Gain</div>
                            </div>
                          </div>
                        ))}
                        {suggestion.options.length > 3 && (
                          <button
                            onClick={() => setExpandedTransfers((prev: any) => ({ ...prev, [suggestion.out.id]: !prev[suggestion.out.id] }))}
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
            <div className="flex justify-between items-end mb-6">
              <h3 className="font-serif italic text-2xl">Current Squad Metrics</h3>
              <span className="font-mono text-[9px] opacity-40 uppercase tracking-tighter italic pb-1">
                Lock icons to ignore players in recommendations
              </span>
            </div>
            <div className="border border-[#141414]/10">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr] p-3 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest">
                <div>Player</div>
                <div className="text-center">Form</div>
                <div className="text-center">FDR</div>
                <div className="text-center">Value</div>
              </div>
              {mySquad.sort((a, b) => b.valueScore - a.valueScore).map((p, i) => (
                <div key={i} className={`grid grid-cols-[2fr_1fr_1fr_1fr] p-3 border-b border-[#141414]/10 font-mono text-xs items-center transition-opacity
                  ${excludedPlayerIds.has(p.id) ? 'opacity-40 bg-[#141414]/5' : ''}`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => toggleExcludePlayer(p.id)}
                      className={`p-1.5 border transition-colors ${excludedPlayerIds.has(p.id) ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414]/20 hover:border-[#141414]'}`}
                      title={excludedPlayerIds.has(p.id) ? "Unlock (Include in suggestions)" : "Lock (Ignore for suggestions)"}
                    >
                      {excludedPlayerIds.has(p.id) ? <Lock size={12} /> : <Unlock size={12} />}
                    </button>
                    <div>
                      <div className="font-bold flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                      <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
                    </div>
                  </div>
                  <div className="text-center">{p.realForm}</div>
                  <div className={`text-center font-bold ${Math.round(p.fdr) <= 2 ? 'text-emerald-600' : Math.round(p.fdr) >= 4 ? 'text-rose-600' : ''}`}>{p.fdr}</div>
                  <div className="text-center font-bold text-emerald-600">{p.valueScore}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
