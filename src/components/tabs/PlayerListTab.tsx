import React, { useState } from "react";
import { 
  Search, 
  ArrowUpRight, 
  ArrowDownRight, 
  Loader2, 
  Info, 
  Zap,
  Shield,
  Target
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Player, Team, Fixture, PlayerSummary, POSITION_MAP } from "../../types";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { getTeamName, getTeamShortName } from "../../utils/team";
import { getFDRColor } from "../../utils/player";
import { getNextFixtures } from "../../utils/fixtures";

const POSITION_COLORS: Record<number, string> = {
  1: "text-yellow-500",
  2: "text-blue-500",
  3: "text-emerald-500",
  4: "text-rose-500",
};

const POSITION_ICONS: Record<number, any> = {
  1: Shield,
  2: Shield,
  3: Zap,
  4: Target,
};

interface PlayerListTabProps {
  processedPlayers: any[];
  sortConfig: { key: string; direction: 'asc' | 'desc' };
  setSortConfig: (config: any) => void;
  expandedPlayer: number | null;
  setExpandedPlayer: (id: number | null) => void;
  fetchPlayerSummary: (id: number) => void;
  playerSummaries: Record<number, PlayerSummary>;
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  positionFilter: number;
  setPositionFilter: (pos: number) => void;
}

export const PlayerListTab = ({
  processedPlayers,
  sortConfig,
  setSortConfig,
  expandedPlayer,
  setExpandedPlayer,
  fetchPlayerSummary,
  playerSummaries,
  fixtures,
  teams,
  tfdrMap,
  searchQuery,
  setSearchQuery,
  positionFilter,
  setPositionFilter
}: PlayerListTabProps) => {

  const [visibleCount, setVisibleCount] = useState(50);

  const handleSort = (key: string) => {
    setSortConfig((prev: any) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const filteredAndSlicedPlayers = processedPlayers.slice(0, visibleCount);

  return (
    <>
      <div className="max-w-7xl mx-auto mb-8">
        {/* Position Filters */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 0, label: 'ALL PLAYERS' },
            { id: 1, label: 'GOALKEEPERS' },
            { id: 2, label: 'DEFENDERS' },
            { id: 3, label: 'MIDFIELDERS' },
            { id: 4, label: 'FORWARDS' }
          ].map((pos) => (
            <button
              key={pos.id}
              onClick={() => {
                setPositionFilter(pos.id);
                setVisibleCount(50); // Reset pagination on filter change
              }}
              className={`px-6 py-3 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
                ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/5'}`}
            >
              {pos.label}
            </button>
          ))}
        </div>

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

      <div className="border-t border-[#141414] overflow-x-auto scrollbar-hide">
        <div className="grid grid-cols-[40px_2.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] min-w-[1100px] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest text-center">
          <div className="text-left">#</div>
          <div className="text-left cursor-pointer hover:opacity-100 flex items-center gap-1" onClick={() => handleSort('web_name')}>
            Player / Team {sortConfig.key === 'web_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('element_type')}>
            Position {sortConfig.key === 'element_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('realForm')}>
            Form (L5) {sortConfig.key === 'realForm' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('fdr')}>
            FDR {sortConfig.key === 'fdr' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('valueScore')}>
            Value {sortConfig.key === 'valueScore' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Goals" className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('metrics.goals')}>
            G {sortConfig.key === 'metrics.goals' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Assists" className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('metrics.assists')}>
            A {sortConfig.key === 'metrics.assists' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Clean Sheets" className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('metrics.cleanSheets')}>
            CS {sortConfig.key === 'metrics.cleanSheets' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Bonus" className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('metrics.bonus')}>
            B {sortConfig.key === 'metrics.bonus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="PP90" className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('perfProfile.base_pp90')}>
            PP90 {sortConfig.key === 'perfProfile.base_pp90' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div>Upcoming FDR</div>
        </div>

        <div className="divide-y divide-[#141414]">
          {filteredAndSlicedPlayers.map((player, index) => {
            const isExpanded = expandedPlayer === player.id;
            const upcoming = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5);

            return (
              <div key={player.id} className="group">
                <div
                  onClick={() => {
                    setExpandedPlayer(isExpanded ? null : player.id);
                    fetchPlayerSummary(player.id);
                  }}
                  className={`grid grid-cols-[40px_2.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] min-w-[1100px] p-4 items-center cursor-pointer transition-all text-center
                    ${isExpanded ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414] hover:text-[#E4E3E0]'}`}
                >
                  <div className="font-mono text-xs opacity-50 text-left">
                    {String(index + 1).padStart(2, '0')}
                  </div>

                  <div className="flex items-center gap-4 text-left">
                    <div className={`p-2 border border-current rounded-full ${POSITION_COLORS[player.element_type]}`}>
                      {React.createElement(POSITION_ICONS[player.element_type], { size: 16 })}
                    </div>
                    <div>
                      <div className="font-bold text-lg tracking-tight leading-none mb-1 flex items-center">
                        {player.web_name}
                        <PlayerAvailabilityIcon player={player} />
                      </div>
                      <div className="font-mono text-[10px] uppercase opacity-60 tracking-wider">
                        {getTeamName(teams, player.team)} • £{(player.now_cost / 10).toFixed(1)}m
                      </div>
                    </div>
                  </div>

                  <div className="font-mono text-xs uppercase tracking-widest opacity-70">
                    {POSITION_MAP[player.element_type]}
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-lg font-bold">{player.realForm}</span>
                    {player.realForm > 5 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : player.realForm < 2 ? <ArrowDownRight className="w-4 h-4 text-rose-500" /> : null}
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className={`font-mono text-lg font-bold ${Math.round(player.fdr) <= 2 ? 'text-emerald-500' : Math.round(player.fdr) >= 4 ? 'text-rose-500' : ''}`}>
                      {player.fdr}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-lg font-bold text-emerald-500">{player.valueScore}</span>
                  </div>

                  <div className="font-mono text-sm opacity-80">{player.metrics.goals}</div>
                  <div className="font-mono text-sm opacity-80">{player.metrics.assists}</div>
                  <div className="font-mono text-sm opacity-80">{player.metrics.cleanSheets}</div>
                  <div className="font-mono text-sm opacity-80">{player.metrics.bonus}</div>

                  <div className="flex items-center justify-center font-mono text-sm font-bold text-blue-500">
                    {player.perfProfile ? player.perfProfile.base_pp90 : '-'}
                  </div>

                  <div className="flex justify-center gap-1">
                    {upcoming.map((f, i) => (
                      <div
                        key={i}
                        className={`w-8 h-8 flex items-center justify-center font-mono text-[10px] border
                          ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20' : getFDRColor(f.difficulty)}`}
                        title={f.isBlank ? `GW ${f.event}: BLANK` : `${f.opponent} (${f.isHome ? 'H' : 'A'}) - FDR: ${f.difficulty}`}
                      >
                        {f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                      </div>
                    ))}
                  </div>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-[#141414] text-[#E4E3E0] border-t border-[#E4E3E0]/10"
                    >
                      <div className="p-4 md:p-8 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
                        {player.news && player.status !== 'a' && (
                          <div className={`md:col-span-3 -mx-4 md:-mx-8 -mt-4 md:-mt-8 mb-4 md:mb-0 p-4 flex items-start gap-3 border-b ${player.status === 's' || player.chance_of_playing_next_round === 0 || player.status === 'i' || player.status === 'u' ? 'border-rose-500/30 bg-rose-500/10 text-rose-400' : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'}`}>
                            <div className="shrink-0 mt-0.5"><Info size={20} /></div>
                            <div>
                              <div className="font-bold text-sm mb-1 uppercase tracking-widest">Availability Report</div>
                              <div className="font-mono text-xs opacity-90">{player.news} {player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100 && `(${player.chance_of_playing_next_round}% chance of playing)`}</div>
                            </div>
                          </div>
                        )}

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
                                    <span>vs {getTeamShortName(teams, h.opponent_team)} ({h.was_home ? 'H' : 'A'})</span>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">MINS</span><span>{h.minutes}</span></div>
                                    <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">G/A</span><span>{h.goals_scored}/{h.assists}</span></div>
                                    <div className="flex flex-col items-center"><span className="opacity-50 text-[10px]">CS/B</span><span>{h.clean_sheets}/{h.bonus}</span></div>
                                    <div className="flex flex-col items-end"><span className="opacity-50 text-[10px]">PTS</span><span className="text-lg font-bold text-emerald-400">{h.total_points}</span></div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

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
                            <h4 className="font-serif italic text-sm mt-6 mb-4 border-b border-[#E4E3E0]/20 pb-1">Season Totals</h4>
                            <div className="grid grid-cols-5 gap-2 text-center font-mono">
                                <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">MINS</span><span className="font-bold">{player.minutes}</span></div>
                                <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">G/A</span><span className="font-bold">{player.goals_scored}/{player.assists}</span></div>
                                <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">CS</span><span className="font-bold">{player.clean_sheets}</span></div>
                                <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">BPS</span><span className="font-bold">{player.bonus}</span></div>
                                <div className="bg-white/5 p-2 flex flex-col justify-center"><span className="text-[9px] opacity-50 mb-1">PTS</span><span className="font-bold text-emerald-400">{player.total_points}</span></div>
                            </div>
                            <div className="p-4 border border-emerald-500/30 bg-emerald-500/5 mt-4">
                              <div className="flex items-center gap-2 font-serif italic text-emerald-400 mb-2"><Info size={14} /> Analysis</div>
                              <p className="font-mono text-[10px] leading-relaxed opacity-70">
                                {player.web_name} has averaged {player.realForm} points over the last 5 games
                                {player.metrics.isPPAAdjusted ? ` (${player.metrics.ppa} points per appearance, adjusted for injury layoff)` : ""}.
                                With an FDR of {player.fdr}, they are a
                                {player.realForm > 5 && player.fdr < 2.5 ? " prime transfer target." :
                                  player.realForm > 5 ? " high-form asset with challenging fixtures." :
                                    player.fdr < 2.5 ? " potential differential with easy games." : " standard asset."}
                              </p>
                            </div>
                          </div>
                        </div>

                        {player.perfProfile && player.perfProfile.archetype !== "Not Enough Data" ? (
                            <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2">
                              <h4 className="font-serif italic text-xl mb-6 flex items-center gap-2">
                                <Zap size={20} className="text-emerald-400" /> Performance Archetype: {player.perfProfile.archetype}
                              </h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                                <div className="font-mono text-sm leading-relaxed opacity-80 border-l-2 border-emerald-400 pl-4">
                                  {player.perfProfile.archetype_blurb}
                                  <div className="mt-4 opacity-50 text-[10px] uppercase">Based on {player.perfProfile.appearances} apps ({player.perfProfile.total_minutes} mins)</div>
                                </div>
                                <div className="grid grid-cols-4 gap-2 text-center font-mono">
                                  <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 2</span><span className="text-lg font-bold text-emerald-400">{player.perfProfile.pp90_fdr2?.toFixed(1) ?? "-"}</span></div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 3</span><span className="text-lg font-bold">{player.perfProfile.pp90_fdr3?.toFixed(1) ?? "-"}</span></div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 4</span><span className="text-lg font-bold text-rose-300">{player.perfProfile.pp90_fdr4?.toFixed(1) ?? "-"}</span></div>
                                  <div className="bg-white/5 p-3 flex flex-col justify-center"><span className="text-[10px] opacity-50 mb-1">FDR 5</span><span className="text-lg font-bold text-rose-500">{player.perfProfile.pp90_fdr5?.toFixed(1) ?? "-"}</span></div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-8 mt-2 opacity-50">
                              <div className="flex items-center gap-2 font-serif italic text-lg mb-2"><Zap size={16} /> Performance Profile: Pending</div>
                              <p className="font-mono text-[10px] uppercase tracking-widest">Insufficient minutes found to generate a reliable tactical archetype (requires 3+ apps).</p>
                            </div>
                          )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {processedPlayers.length > visibleCount && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setVisibleCount(prev => prev + 50)}
              className="px-12 py-4 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
            >
              Show More Results ({processedPlayers.length - visibleCount} Remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
};
