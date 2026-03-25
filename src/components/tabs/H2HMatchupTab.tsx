import { Swords, TrendingUp, ArrowDownRight, ArrowUpRight, ChevronRight, ChevronDown } from "lucide-react";
import { getTeamShortName } from "../../utils/team";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { Team } from "../../types";

interface H2HMatchupTabProps {
  myTeamId: string;
  setMyTeamId: (id: string) => void;
  opponentTeamId: string;
  setOpponentTeamId: (id: string) => void;
  fetchH2H: (myId: string, oppId: string) => void;
  myTeamLoading: boolean;
  opponentLoading: boolean;
  myTeamError: string | null;
  h2hData: any;
  myTeamInfo: any;
  opponentTeamInfo: any;
  myTeamHistory: any;
  opponentTeamHistory: any;
  expandedTransfers: Record<string, boolean>;
  setExpandedTransfers: any;
  teams: Team[];
}

export const H2HMatchupTab = ({
  myTeamId,
  setMyTeamId,
  opponentTeamId,
  setOpponentTeamId,
  fetchH2H,
  myTeamLoading,
  opponentLoading,
  myTeamError,
  h2hData,
  myTeamInfo,
  opponentTeamInfo,
  myTeamHistory,
  opponentTeamHistory,
  expandedTransfers,
  setExpandedTransfers,
  teams
}: H2HMatchupTabProps) => {
  return (
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y border-[#141414] py-8">
            <div className="text-center md:text-right md:border-r border-[#141414]/20 pr-0 md:pr-8">
              <div className="font-serif italic text-2xl">{myTeamInfo?.player_first_name} {myTeamInfo?.player_last_name}</div>
              <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{myTeamInfo?.name}</div>
              <div className="mt-6 grid grid-cols-3 gap-4 italic md:not-italic">
                <div>
                  <div className="font-mono text-xl font-bold">£{(myTeamInfo?.last_deadline_bank / 10).toFixed(1)}m</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">{myTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Rank</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">{myTeamInfo?.summary_overall_points?.toLocaleString()}</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Total Points</div>
                </div>
              </div>
            </div>

            <div className="text-center md:text-left pl-0 md:pl-8 pt-8 md:pt-0 border-t md:border-t-0 border-[#141414]/10">
              <div className="font-serif italic text-2xl">{opponentTeamInfo?.player_first_name} {opponentTeamInfo?.player_last_name}</div>
              <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{opponentTeamInfo?.name}</div>
              <div className="mt-6 grid grid-cols-3 gap-4 italic md:not-italic">
                <div>
                  <div className="font-mono text-xl font-bold">£{(opponentTeamInfo?.last_deadline_bank / 10).toFixed(1)}m</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">{opponentTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Rank</div>
                </div>
                <div>
                  <div className="font-mono text-xl font-bold">{opponentTeamInfo?.summary_overall_points?.toLocaleString()}</div>
                  <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Total Points</div>
                </div>
              </div>
            </div>
          </div>

          {/* Form & Chips Comparison */}
          {myTeamHistory && opponentTeamHistory && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y border-[#141414] py-8">
              <div className="md:border-r border-[#141414]/20 pr-0 md:pr-8">
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

              <div className="pl-0 md:pl-8 pt-8 md:pt-0 border-t md:border-t-0 border-[#141414]/10 text-center md:text-left">
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

          {/* Breakdown */}
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
                  {h2hData.myDiff.map((p: any, i: number) => (
                    <div key={i} className="p-3 flex justify-between items-center bg-white/50">
                      <div>
                        <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                        <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
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
                  {h2hData.common.map((p: any, i: number) => (
                    <div key={i} className="p-3 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                        <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
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
                  {h2hData.oppDiff.map((p: any, i: number) => (
                    <div key={i} className="p-3 flex justify-between items-center bg-white/50">
                      <div>
                        <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                        <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
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

          {/* Edge Finder */}
          {h2hData.suggestions.length > 0 && (
            <div>
              <h3 className="font-serif italic text-2xl mb-8 flex items-center gap-3">
                <TrendingUp className="w-6 h-6" /> Edge Finder
              </h3>
              <p className="font-mono text-xs opacity-60 mb-6">
                Replacing your weakest differentials with these options (within your budget) gives you the highest statistical edge against their unique players in this matchup.
              </p>

              <div className="space-y-6">
                {h2hData.suggestions.map((suggestion: any, i: number) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.5fr] gap-8 items-center bg-white/50 p-6 border border-[#141414]/10">
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

                    <div className="flex md:block justify-center py-2 md:py-0 text-[#141414]/20 scale-75 md:scale-100">
                      <ChevronRight size={32} className="hidden md:block" />
                      <ChevronDown size={32} className="md:hidden" />
                    </div>

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
                                  <div className="font-bold text-sm flex items-center">{opt.web_name} <PlayerAvailabilityIcon player={opt} /></div>
                                  <div className="font-mono text-[10px] opacity-50 uppercase">
                                    {getTeamShortName(teams, opt.team)} • £{(opt.now_cost / 10).toFixed(1)}m
                                  </div>
                                </div>
                              </div>
                              <div className="text-right relative z-10">
                                <div className="font-mono text-sm font-bold text-emerald-500">+{(opt.valueScore - suggestion.out.valueScore).toFixed(1)}</div>
                                <div className="font-mono text-[10px] opacity-50 uppercase">Edge Gained</div>
                              </div>
                            </div>
                          ))}
                          {suggestion.options.length > 3 && (
                            <button
                              onClick={() => setExpandedTransfers((prev: any) => ({ ...prev, [suggestion.out.id]: !prev[suggestion.out.id] }))}
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
  );
};
