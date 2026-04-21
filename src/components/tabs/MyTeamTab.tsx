import { useState } from "react";
import { ArrowUpRight, Lock, Unlock, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { getTeamShortName } from "../../utils/team";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { PitchFormation } from "../common/PitchFormation";
import { Team, POSITION_MAP } from "../../types";

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
  fplChips: any[];
  currentGW: number | null;
}

const POSITION_COLORS: Record<number, string> = {
  1: "bg-amber-400/20 text-amber-700",
  2: "bg-blue-400/20 text-blue-700",
  3: "bg-emerald-400/20 text-emerald-700",
  4: "bg-rose-400/20 text-rose-700",
};

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
  teams,
  fplChips,
  currentGW,
}: MyTeamTabProps) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const getChipLabel = (name: string) => {
    switch (name) {
      case "bboost": return "Bench Boost";
      case "3xc": return "Triple Capt";
      case "freehit": return "Free Hit";
      case "wildcard": return "Wildcard";
      default: return name;
    }
  };

  const handlePlayerClick = (id: number) => {
    setSelectedPlayerId((prev) => (prev === id ? null : id));
  };

  const weakPlayerIds = new Set(transferSuggestions.map((s) => s.out.id));
  const highlightRanks = new Map(transferSuggestions.map((s, i) => [s.out.id, i + 1]));
  const selectedPlayer = selectedPlayerId !== null ? mySquad.find((p) => p.id === selectedPlayerId) : null;
  const selectedSuggestion = selectedPlayerId !== null ? transferSuggestions.find((s) => s.out.id === selectedPlayerId) : null;

  // Squad aggregate stats for the empty fallback
  const avgValueScore = mySquad.length
    ? (mySquad.reduce((s, p) => s + p.valueScore, 0) / mySquad.length).toFixed(1)
    : 0;
  const avgFdr = mySquad.length
    ? (mySquad.reduce((s, p) => s + p.fdr, 0) / mySquad.length).toFixed(2)
    : 0;
  const squadValue = mySquad.reduce((s, p) => s + p.now_cost, 0) / 10;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-10 text-center">
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
                <span className="font-mono text-[9px] uppercase opacity-50 tracking-[0.2em]">Highlight weak links</span>
                <span className="font-mono text-[10px] font-bold bg-[#141414] text-[#E4E3E0] px-2 py-0.5">TOP {numTransfers}</span>
              </div>
              <div className="px-1">
                <input
                  type="range" min="1" max="15" step="1" value={numTransfers}
                  onChange={(e) => setNumTransfers(parseInt(e.target.value))}
                  className="w-full h-0.5 appearance-none cursor-pointer"
                  style={{
                    WebkitAppearance: "none",
                    background: `linear-gradient(to right, #141414 ${((numTransfers - 1) / 14) * 100}%, #14141410 ${((numTransfers - 1) / 14) * 100}%)`,
                  }}
                />
                <div className="relative h-4 mt-2 font-mono text-[8px] opacity-40">
                  {[{ val: "1", left: "0%" }, { val: "5", left: "28.6%" }, { val: "10", left: "64.3%" }, { val: "15", left: "100%" }].map(({ val, left }) => (
                    <div key={val} className="absolute top-0 flex flex-col items-center" style={{ left, transform: left === "0%" ? undefined : left === "100%" ? "translateX(-100%)" : "translateX(-50%)" }}>
                      <div className="w-px h-0.5 bg-[#141414]" />
                      <span className="mt-1">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        {myTeamError && (
          <p className="mt-4 text-rose-500 font-mono text-[10px] uppercase">{myTeamError}</p>
        )}
      </div>

      {mySquad.length > 0 && (
        <div className="space-y-10">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-6 border-b border-[#141414]/20">
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
                  ) : myTeamHistory.chips.map((chip: any, i: number) => (
                    <div key={i} className="px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono text-[8px] uppercase tracking-wider">
                      {getChipLabel(chip.name)} (GW{chip.event})
                    </div>
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest">Chips Available</div>
                <div className="flex justify-center gap-2 flex-wrap">
                  {(() => {
                    const available = fplChips.filter((def) => {
                      const isPlayed = myTeamHistory.chips.some((played: any) =>
                        played.name === def.name && played.event >= def.start_event && played.event <= def.stop_event
                      );
                      if (isPlayed) return false;
                      if (currentGW && currentGW > def.stop_event) return false;
                      return true;
                    });
                    if (available.length === 0) return <span className="font-mono text-[10px] italic opacity-50">None</span>;
                    return available.map((c: any, i: number) => (
                      <div key={i} className="px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-mono text-[8px] uppercase tracking-wider">
                        {getChipLabel(c.name)}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Main: pitch + detail panel side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
            {/* Left: Pitch */}
            <div>
              <PitchFormation
                squad={mySquad}
                teams={teams}
                highlightIds={weakPlayerIds}
                highlightColor="rose"
                highlightRanks={highlightRanks}
                onPlayerClick={handlePlayerClick}
                excludedPlayerIds={excludedPlayerIds}
                interactive={true}
              />
            </div>

            {/* Right: Detail panel */}
            <div className="lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto lg:mt-[38px]">
              {selectedPlayer ? (
                /* ── Player detail view ── */
                <div className="border border-[#141414]/20 bg-white/60">
                  {/* Back button */}
                  <button
                    onClick={() => setSelectedPlayerId(null)}
                    className="flex items-center gap-1 px-4 py-3 w-full border-b border-[#141414]/10 font-mono text-[9px] uppercase tracking-widest opacity-50 hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft size={12} /> Transfer Targets
                  </button>

                  {/* Player header */}
                  <div className={`flex items-start justify-between p-4 border-b ${weakPlayerIds.has(selectedPlayer.id) ? "border-rose-500/20 bg-rose-500/5" : "border-[#141414]/10"}`}>
                    <div>
                      <div className="font-bold text-lg flex items-center gap-1 flex-wrap">
                        {selectedPlayer.web_name}
                        <PlayerAvailabilityIcon player={selectedPlayer} />
                        {selectedPlayer.is_captain && <span className="px-1.5 py-0.5 bg-amber-400 text-black font-mono text-[8px] font-bold">C</span>}
                        {!selectedPlayer.is_captain && selectedPlayer.is_vice_captain && <span className="px-1.5 py-0.5 bg-amber-300/70 text-black font-mono text-[8px] font-bold">V</span>}
                      </div>
                      <div className="font-mono text-[10px] opacity-50 uppercase mt-0.5 flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[8px] font-bold ${POSITION_COLORS[selectedPlayer.element_type]}`}>
                          {POSITION_MAP[selectedPlayer.element_type]}
                        </span>
                        {getTeamShortName(teams, selectedPlayer.team)} · £{(selectedPlayer.now_cost / 10).toFixed(1)}m
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {weakPlayerIds.has(selectedPlayer.id) && (
                        <span className="font-mono text-[8px] uppercase tracking-wider text-rose-500 border border-rose-500/30 bg-rose-500/10 px-2 py-0.5">
                          Weak Link
                        </span>
                      )}
                      <button
                        onClick={() => toggleExcludePlayer(selectedPlayer.id)}
                        className={`p-2 border transition-colors ${excludedPlayerIds.has(selectedPlayer.id) ? "bg-[#141414] text-[#E4E3E0] border-[#141414]" : "border-[#141414]/20 hover:border-[#141414]"}`}
                        title={excludedPlayerIds.has(selectedPlayer.id) ? "Unlock (include in suggestions)" : "Lock (exclude from suggestions)"}
                      >
                        {excludedPlayerIds.has(selectedPlayer.id) ? <Lock size={13} /> : <Unlock size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 divide-x divide-[#141414]/10 border-b border-[#141414]/10">
                    <div className="p-4 text-center">
                      <div className="font-mono text-xl font-bold text-emerald-600">{selectedPlayer.valueScore}</div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Value Score</div>
                    </div>
                    <div className="p-4 text-center">
                      <div className={`font-mono text-xl font-bold ${Math.round(selectedPlayer.fdr) <= 2 ? "text-emerald-600" : Math.round(selectedPlayer.fdr) >= 4 ? "text-rose-600" : ""}`}>
                        {selectedPlayer.fdr}
                      </div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Avg FDR</div>
                    </div>
                  </div>

                  {/* Transfer options */}
                  <div className="p-4">
                    {excludedPlayerIds.has(selectedPlayer.id) ? (
                      <p className="font-mono text-[10px] opacity-50 italic text-center py-4">
                        Player is locked — excluded from transfer analysis
                      </p>
                    ) : selectedSuggestion ? (
                      <>
                        <div className="font-mono text-[9px] uppercase opacity-50 tracking-widest mb-3">
                          Better Options (Within Budget)
                        </div>
                        {selectedSuggestion.options.length === 0 ? (
                          <p className="font-mono text-[10px] opacity-50 italic">No better options found within budget.</p>
                        ) : (
                          <div className="space-y-2">
                            {(expandedTransfers[selectedPlayer.id] ? selectedSuggestion.options : selectedSuggestion.options.slice(0, 4)).map((opt: any, j: number) => (
                              <div key={j} className="flex items-center justify-between bg-white p-3 border border-[#141414]/10">
                                <div className="flex items-center gap-2">
                                  <ArrowUpRight size={14} className="text-emerald-500 shrink-0" />
                                  <div>
                                    <div className="font-bold text-sm flex items-center">
                                      {opt.web_name}<PlayerAvailabilityIcon player={opt} />
                                    </div>
                                    <div className="font-mono text-[9px] opacity-50 uppercase">
                                      {getTeamShortName(teams, opt.team)} · £{(opt.now_cost / 10).toFixed(1)}m
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <div className="font-mono text-sm font-bold text-emerald-500">+{(opt.valueScore - selectedPlayer.valueScore).toFixed(1)}</div>
                                  <div className="font-mono text-[8px] opacity-40 uppercase">Value Gain</div>
                                </div>
                              </div>
                            ))}
                            {selectedSuggestion.options.length > 4 && (
                              <button
                                onClick={() => setExpandedTransfers((prev: any) => ({ ...prev, [selectedPlayer.id]: !prev[selectedPlayer.id] }))}
                                className="w-full py-2 font-mono text-[9px] uppercase tracking-widest border border-[#141414]/20 hover:bg-[#141414]/5 transition-colors flex items-center justify-center gap-1"
                              >
                                {expandedTransfers[selectedPlayer.id] ? <><ChevronUp size={11} /> Show Less</> : <><ChevronDown size={11} /> {selectedSuggestion.options.length - 4} More Options</>}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="font-mono text-[10px] opacity-50 italic text-center py-4">
                        Not flagged as a transfer target — adjust the slider to include more players
                      </p>
                    )}
                  </div>
                </div>

              ) : weakPlayerIds.size > 0 ? (
                /* ── Transfer targets list (default) ── */
                <div className="border border-[#141414]/20">
                  <div className="flex items-center justify-between px-4 py-3 bg-[#141414] text-[#E4E3E0]">
                    <span className="font-mono text-[10px] uppercase tracking-widest">Transfer Targets</span>
                    <span className="font-mono text-[10px] font-bold bg-rose-500 px-2 py-0.5">{weakPlayerIds.size}</span>
                  </div>
                  <div className="divide-y divide-[#141414]/10">
                    {transferSuggestions.map((suggestion, i) => {
                      const p = suggestion.out;
                      const isLocked = excludedPlayerIds.has(p.id);
                      return (
                        <button
                          key={i}
                          onClick={() => handlePlayerClick(p.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#141414]/5 transition-colors group ${isLocked ? "opacity-40" : ""}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono text-[9px] font-bold opacity-30 w-4 shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-sm flex items-center gap-1 truncate">
                                {p.web_name}
                                <PlayerAvailabilityIcon player={p} />
                                {isLocked && <Lock size={10} className="opacity-50 shrink-0" />}
                              </div>
                              <div className="font-mono text-[9px] opacity-50 uppercase">
                                <span className={`px-1 py-px text-[7px] font-bold mr-1 ${POSITION_COLORS[p.element_type]}`}>
                                  {POSITION_MAP[p.element_type]}
                                </span>
                                {getTeamShortName(teams, p.team)} · £{(p.now_cost / 10).toFixed(1)}m
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <div className="font-mono text-sm font-bold text-rose-500">{p.valueScore}</div>
                              <div className="font-mono text-[8px] opacity-40 uppercase">Value</div>
                            </div>
                            <ChevronRight size={14} className="opacity-20 group-hover:opacity-60 transition-opacity" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="px-4 py-3 border-t border-[#141414]/10 font-mono text-[8px] opacity-30 uppercase tracking-tighter text-center italic">
                    Click a player to view transfer options · Click on pitch to select
                  </div>
                </div>

              ) : (
                /* ── Squad stats fallback ── */
                <div className="border border-[#141414]/20 bg-white/40">
                  <div className="px-4 py-3 border-b border-[#141414]/10">
                    <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Squad Overview</span>
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-[#141414]/10">
                    <div className="p-5 text-center">
                      <div className="font-mono text-2xl font-bold">£{squadValue.toFixed(1)}m</div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Squad Value</div>
                    </div>
                    <div className="p-5 text-center">
                      <div className="font-mono text-2xl font-bold text-emerald-600">{avgValueScore}</div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Avg Value Score</div>
                    </div>
                    <div className="p-5 text-center">
                      <div className={`font-mono text-2xl font-bold ${Number(avgFdr) <= 2.5 ? "text-emerald-600" : Number(avgFdr) >= 3.8 ? "text-rose-600" : ""}`}>{avgFdr}</div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Avg FDR</div>
                    </div>
                    <div className="p-5 text-center">
                      <div className="font-mono text-2xl font-bold">{mySquad.filter(p => p.position <= 11).length}</div>
                      <div className="font-mono text-[8px] uppercase opacity-50 mt-1">Starters</div>
                    </div>
                  </div>
                  <div className="px-4 py-4 border-t border-[#141414]/10 font-mono text-[9px] opacity-40 italic text-center">
                    Adjust the slider above to highlight weak links · Click any player on the pitch to inspect
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
