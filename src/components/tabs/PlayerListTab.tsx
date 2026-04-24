import React, { useState, useMemo, memo } from "react";

const Sparkline = memo(({ history }: { history: any[] }) => {
  const pts = history.slice(-7).map((h: any) => h.total_points);
  if (pts.length < 3) return null;
  const W = 36, H = 16;
  const max = Math.max(...pts, 2);
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - (v / max) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first3 = pts.slice(0, 3).reduce((s, v) => s + v, 0);
  const last3 = pts.slice(-3).reduce((s, v) => s + v, 0);
  const color = last3 > first3 * 1.1 ? '#10B981' : last3 < first3 * 0.9 ? '#F43F5E' : '#94A3B8';
  return (
    <svg width={W} height={H} className="shrink-0 opacity-70">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
});
import {
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Info,
  Zap,
  X,
  Crosshair,
  GitCompare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Player, Team, Fixture, PlayerSummary, POSITION_MAP } from "../../types";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";
import { getTeamName, getTeamShortName } from "../../utils/team";
import { getFDRColor } from "../../utils/player";
import { getNextFixtures } from "../../utils/fixtures";
import { computePositionThresholds } from "../../utils/playerThresholds";
import { getPlayerFlags } from "../../utils/playerSignals";


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
  teamFilter: number | null;
  setTeamFilter: (id: number | null) => void;
  onCompare?: (id: number) => void;
  currentGW: number;
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
  setPositionFilter,
  teamFilter,
  setTeamFilter,
  onCompare,
  currentGW
}: PlayerListTabProps) => {

  const [visibleCount, setVisibleCount] = useState(50);
  const [activeSignals, setActiveSignals] = useState<Set<string>>(new Set());
  const [showPositions, setShowPositions] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [showArchetypes, setShowArchetypes] = useState(false);
  const [activeArchetypes, setActiveArchetypes] = useState<Set<string>>(new Set());
  const [showPriceFilter, setShowPriceFilter] = useState(false);
  const [minPrice, setMinPrice] = useState(3.0);
  const [maxPrice, setMaxPrice] = useState<number | null>(null); // null = no upper limit set yet

  const maxPlayerPrice = useMemo(() => {
    if (processedPlayers.length === 0) return 15.0;
    return Math.ceil((Math.max(...processedPlayers.map(p => p.now_cost / 10)) * 10)) / 10;
  }, [processedPlayers]);

  const effectiveMaxPrice = maxPrice ?? maxPlayerPrice;

  const priceOptions = useMemo(() => {
    const options: number[] = [];
    for (let p = 3.0; p <= maxPlayerPrice + 0.01; p = Math.round((p + 0.2) * 10) / 10) {
      options.push(p);
    }
    return options;
  }, [maxPlayerPrice]);

  const isPriceFilterActive = minPrice !== 3.0 || (maxPrice !== null && maxPrice !== maxPlayerPrice);

  const toggleArchetype = (archetype: string) => {
    setActiveArchetypes(prev => {
      const next = new Set(prev);
      if (next.has(archetype)) next.delete(archetype); else next.add(archetype);
      return next;
    });
    setVisibleCount(50);
  };

  const toggleSignal = (signal: string) => {
    setActiveSignals(prev => {
      const next = new Set(prev);
      if (next.has(signal)) next.delete(signal); else next.add(signal);
      return next;
    });
    setVisibleCount(50);
  };

  const handleSort = (key: string) => {
    setSortConfig((prev: any) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const positionThresholds = useMemo(
    () => computePositionThresholds(processedPlayers),
    [processedPlayers]
  );

  const displayedPlayers = processedPlayers.filter(p => {
    if (activeSignals.size > 0) {
      const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = getPlayerFlags(p, fixtures, teams, tfdrMap, positionThresholds, currentGW);
      const matchesSignal =
        (activeSignals.has('ftb') && isFTBRun) ||
        (activeSignals.has('form') && isFormRun) ||
        (activeSignals.has('gem') && isHiddenGem) ||
        (activeSignals.has('price') && isPriceRise) ||
        (activeSignals.has('booking') && isBookingRisk) ||
        (activeSignals.has('dueagoal') && isDueAGoal) ||
        (activeSignals.has('regression') && isRegressionRisk);
      if (!matchesSignal) return false;
    }
    if (activeArchetypes.size > 0) {
      const archetype = p.perfProfile?.archetype;
      if (!archetype || !activeArchetypes.has(archetype)) return false;
    }
    const playerPrice = p.now_cost / 10;
    if (playerPrice < minPrice || playerPrice > effectiveMaxPrice) return false;
    return true;
  });

  const filteredAndSlicedPlayers = displayedPlayers.slice(0, visibleCount);

  return (
    <>
      <div className="max-w-7xl mx-auto mb-8">
        {/* Collapsible Filters */}
        <div className="flex flex-col gap-2 mb-6">
          {/* Team filter chip — shown when navigating from Schedules heatmap */}
          {teamFilter !== null && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#141414] text-[#E4E3E0] font-mono text-[10px] uppercase tracking-widest">
                <span className="opacity-60">Team:</span>
                <span className="font-bold">{getTeamShortName(teams, teamFilter)}</span>
                <button
                  onClick={() => setTeamFilter(null)}
                  className="opacity-50 hover:opacity-100 transition-opacity ml-1"
                  aria-label="Clear team filter"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
          )}
          {/* Pill row */}
          <div className="flex flex-wrap gap-2">
            {/* Position pill */}
            {(() => {
              const posLabels: Record<number, string> = { 0: 'ALL', 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };
              const isActive = positionFilter !== 0;
              return (
                <button
                  onClick={() => setShowPositions(p => !p)}
                  className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                    ${isActive ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
                >
                  Position: {posLabels[positionFilter]}
                  <span className="opacity-60">{showPositions ? '▴' : '▾'}</span>
                </button>
              );
            })()}
            {/* Signals pill */}
            {(() => {
              const isActive = activeSignals.size > 0;
              return (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowSignals((p: boolean) => !p)}
                    className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                      ${isActive ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
                  >
                    {isActive ? `Signals (${activeSignals.size})` : 'Signals'}
                    <span className="opacity-60">{showSignals ? '▴' : '▾'}</span>
                  </button>
                  {isActive && (
                    <button
                      onClick={() => { setActiveSignals(new Set()); setVisibleCount(50); }}
                      className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                      title="Clear signal filters"
                    >
                      <X size={12} className="opacity-60 hover:opacity-100" />
                    </button>
                  )}
                </div>
              );
            })()}
            {/* Archetypes pill */}
            {(() => {
              const isActive = activeArchetypes.size > 0;
              return (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowArchetypes((p: boolean) => !p)}
                    className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                      ${isActive ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
                  >
                    {isActive ? `Archetype (${activeArchetypes.size})` : 'Archetype'}
                    <span className="opacity-60">{showArchetypes ? '▴' : '▾'}</span>
                  </button>
                  {isActive && (
                    <button
                      onClick={() => { setActiveArchetypes(new Set()); setVisibleCount(50); }}
                      className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                      title="Clear archetype filter"
                    >
                      <X size={12} className="opacity-60 hover:opacity-100" />
                    </button>
                  )}
                </div>
              );
            })()}
            {/* Price filter pill */}
            {(() => {
              return (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowPriceFilter(p => !p)}
                    className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                      ${isPriceFilterActive ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
                  >
                    {isPriceFilterActive ? `Price: £${minPrice.toFixed(1)}–£${effectiveMaxPrice.toFixed(1)}m` : 'Price'}
                    <span className="opacity-60">{showPriceFilter ? '▴' : '▾'}</span>
                  </button>
                  {isPriceFilterActive && (
                    <button
                      onClick={() => { setMinPrice(3.0); setMaxPrice(null); setVisibleCount(50); }}
                      className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                      title="Clear price filter"
                    >
                      <X size={12} className="opacity-60 hover:opacity-100" />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Position options (inline expand) */}
          {showPositions && (
            <div className="flex flex-wrap gap-2">
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
                    setVisibleCount(50);
                    setShowPositions(false);
                  }}
                  className={`px-5 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
                    ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10'}`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          )}

          {/* Signal options (inline expand) */}
          {showSignals && (
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'ftb',        label: 'FTB Run',          activeClass: 'bg-orange-500 border-orange-500 text-white',   inactiveClass: 'border-orange-400 text-orange-600 hover:bg-orange-50' },
                { key: 'form',       label: 'Form Run',         activeClass: 'bg-emerald-600 border-emerald-600 text-white', inactiveClass: 'border-emerald-400 text-emerald-600 hover:bg-emerald-50' },
                { key: 'gem',        label: 'Hidden Gem',       activeClass: 'bg-violet-600 border-violet-600 text-white',   inactiveClass: 'border-violet-400 text-violet-600 hover:bg-violet-50' },
                { key: 'price',      label: 'Price Rise',       activeClass: 'bg-sky-600 border-sky-600 text-white',         inactiveClass: 'border-sky-400 text-sky-600 hover:bg-sky-50' },
                { key: 'booking',    label: 'Booking Risk',     activeClass: 'bg-red-600 border-red-600 text-white',         inactiveClass: 'border-red-400 text-red-600 hover:bg-red-50' },
                { key: 'dueagoal',   label: 'Due a Goal',       activeClass: 'bg-yellow-500 border-yellow-500 text-white',   inactiveClass: 'border-yellow-500 text-yellow-600 hover:bg-yellow-50' },
                { key: 'regression', label: 'Regression Risk',  activeClass: 'bg-fuchsia-600 border-fuchsia-600 text-white', inactiveClass: 'border-fuchsia-400 text-fuchsia-600 hover:bg-fuchsia-50' },
              ].map(({ key, label, activeClass, inactiveClass }) => (
                <button
                  key={key}
                  onClick={() => toggleSignal(key)}
                  className={`flex items-center gap-2 px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all
                    ${activeSignals.has(key) ? activeClass : inactiveClass}`}
                >
                  <Crosshair size={11} />
                  {label}
                </button>
              ))}
            </div>
          )}
          {/* Archetype options (inline expand) */}
          {showArchetypes && (
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'Talisman',        activeClass: 'bg-emerald-600 border-emerald-600 text-white', inactiveClass: 'border-emerald-400 text-emerald-600 hover:bg-emerald-50' },
                { key: 'Flat Track Bully', activeClass: 'bg-amber-500 border-amber-500 text-white',   inactiveClass: 'border-amber-400 text-amber-600 hover:bg-amber-50' },
                { key: 'Workhorse',        activeClass: 'bg-sky-600 border-sky-600 text-white',        inactiveClass: 'border-sky-400 text-sky-600 hover:bg-sky-50' },
                { key: 'Rotation Risk',    activeClass: 'bg-orange-500 border-orange-500 text-white',  inactiveClass: 'border-orange-400 text-orange-600 hover:bg-orange-50' },
                { key: 'Squad Player',     activeClass: 'bg-slate-600 border-slate-600 text-white',    inactiveClass: 'border-slate-400 text-slate-600 hover:bg-slate-50' },
              ].map(({ key, activeClass, inactiveClass }) => (
                <button
                  key={key}
                  onClick={() => toggleArchetype(key)}
                  className={`px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all
                    ${activeArchetypes.has(key) ? activeClass : inactiveClass}`}
                >
                  {key}
                </button>
              ))}
            </div>
          )}
          {/* Price filter (inline expand) */}
          {showPriceFilter && (
            <div className="flex items-center gap-3 py-1">
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Min</span>
              <select
                value={minPrice}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMinPrice(val);
                  if (val > effectiveMaxPrice) setMaxPrice(val);
                  setVisibleCount(50);
                }}
                className="border border-[#141414] bg-transparent font-mono text-[10px] uppercase tracking-widest px-3 py-2 focus:outline-none focus:bg-white/50 transition-colors cursor-pointer"
              >
                {priceOptions.map(p => (
                  <option key={p} value={p}>£{p.toFixed(1)}m</option>
                ))}
              </select>
              <span className="font-mono text-[10px] uppercase tracking-widest opacity-60">Max</span>
              <select
                value={effectiveMaxPrice}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setMaxPrice(val === maxPlayerPrice ? null : val);
                  if (val < minPrice) setMinPrice(val);
                  setVisibleCount(50);
                }}
                className="border border-[#141414] bg-transparent font-mono text-[10px] uppercase tracking-widest px-3 py-2 focus:outline-none focus:bg-white/50 transition-colors cursor-pointer"
              >
                {priceOptions.map(p => (
                  <option key={p} value={p}>£{p.toFixed(1)}m</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 opacity-40" />
          <input
            type="text"
            placeholder="SEARCH PLAYER OR TEAM..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent border border-[#141414] py-4 pl-12 pr-12 font-mono text-sm focus:outline-none focus:bg-white/50 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-[#141414]/5 rounded-full transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4 opacity-40 hover:opacity-100" />
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-[#141414]">
        <div className="grid grid-cols-[1fr_0.7fr_1.2fr] md:grid-cols-[2.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest text-center">
          <div className="text-left cursor-pointer hover:opacity-100 flex items-center gap-1" onClick={() => handleSort('web_name')}>
            Player {sortConfig.key === 'web_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('element_type')}>
            POS {sortConfig.key === 'element_type' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('fplForm')}>
            Form {sortConfig.key === 'fplForm' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('fdr')}>
            FDR {sortConfig.key === 'fdr' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="cursor-pointer hover:opacity-100 flex items-center justify-center gap-1" onClick={() => handleSort('valueScore')}>
            Value {sortConfig.key === 'valueScore' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('now_cost')}>
            Price {sortConfig.key === 'now_cost' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Expected Points per £1m" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('valueEfficiency')}>
            Val/£m {sortConfig.key === 'valueEfficiency' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Goals (last 5 games)" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('metrics.goals')}>
            G5 {sortConfig.key === 'metrics.goals' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Assists (last 5 games)" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('metrics.assists')}>
            A5 {sortConfig.key === 'metrics.assists' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Clean Sheets (last 5 games)" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('metrics.cleanSheets')}>
            CS5 {sortConfig.key === 'metrics.cleanSheets' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="Bonus points (last 5 games)" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('metrics.bonus')}>
            B5 {sortConfig.key === 'metrics.bonus' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div title="xPP90 — Expected points per 90, blending underlying stats with actual performance" className="hidden md:flex cursor-pointer hover:opacity-100 items-center justify-center gap-1" onClick={() => handleSort('perfProfile.base_pp90')}>
            xPP90 {sortConfig.key === 'perfProfile.base_pp90' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
          </div>
          <div className="flex items-center justify-center">Fixtures</div>
        </div>

        <div className="divide-y divide-[#141414]">
          {filteredAndSlicedPlayers.map((player) => {
            const isExpanded = expandedPlayer === player.id;
            const upcoming = getNextFixtures(player.team, fixtures, teams, tfdrMap, 5, 0, player.element_type);

            return (
              <div key={player.id} className="group">
                <div
                  onClick={() => {
                    setExpandedPlayer(isExpanded ? null : player.id);
                    fetchPlayerSummary(player.id);
                  }}
                  className={`grid grid-cols-[1fr_0.7fr_1.2fr] md:grid-cols-[2.5fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.8fr_0.5fr_0.5fr_0.5fr_0.5fr_0.8fr_1.5fr] p-4 items-center cursor-pointer transition-all text-center
                    ${isExpanded ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10'}`}
                >
                  <div className="flex items-center gap-4 text-left">
                    <div>
                      <div className="font-bold text-lg tracking-tight leading-none mb-1 flex items-center">
                        {player.web_name}
                        <PlayerAvailabilityIcon player={player} />
                      </div>
                      <div className="font-mono text-[10px] uppercase opacity-60 tracking-wider">
                        <span className="md:hidden">{getTeamShortName(teams, player.team)}</span>
                        <span className="hidden md:inline">{getTeamName(teams, player.team)}</span>
                        {' '}• £{(player.now_cost / 10).toFixed(1)}m
                      </div>
                      {(() => {
                        const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = getPlayerFlags(player, fixtures, teams, tfdrMap, positionThresholds, currentGW);
                        const dots = [
                          isFTBRun       && { color: 'bg-orange-500', label: 'FTB Run — Flat Track Bully with easy fixtures ahead' },
                          isFormRun      && { color: 'bg-emerald-500', label: 'Form Run — Top-20% form for position with easy fixtures ahead' },
                          isHiddenGem    && { color: 'bg-violet-500',  label: `Hidden Gem — ${player.selected_by_percent}% owned, top-10% value score for position` },
                          isPriceRise    && { color: 'bg-sky-500',     label: `Price Rise — ${(player.transfers_in_event ?? 0).toLocaleString()} transfers in this GW` },
                          isBookingRisk  && { color: 'bg-red-500',     label: `Booking Risk — ${player.yellow_cards ?? 0} yellow${(player.yellow_cards ?? 0) !== 1 ? 's' : ''}${player.red_cards ? ` + ${player.red_cards} red` : ''} — suspension risk` },
                          isDueAGoal     && { color: 'bg-yellow-500',  label: `Due a Goal — xG ${parseFloat(player.expected_goals ?? '0').toFixed(1)} but only ${player.goals_scored ?? 0} scored` },
                          isRegressionRisk && { color: 'bg-fuchsia-500', label: `Regression Risk — ${player.goals_scored ?? 0} goals on ${parseFloat(player.expected_goals ?? '0').toFixed(1)} xG — pace unsustainable` },
                        ].filter(Boolean) as { color: string; label: string }[];
                        return dots.length > 0 ? (
                          <div className="flex gap-1.5 mt-1.5">
                            {dots.map((dot, i) => (
                              <div
                                key={i}
                                className="relative group/dot shrink-0 cursor-default"
                              >
                                <div className={`w-3 h-3 rounded-full ${dot.color}`} />
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-[#141414] text-[#E4E3E0] text-[10px] font-mono whitespace-nowrap rounded opacity-0 group-hover/dot:opacity-100 transition-opacity duration-100 delay-75 z-50">
                                  {dot.label}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null;
                      })()}
                    </div>
                    {onCompare && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCompare(player.id); }}
                        className="ml-auto shrink-0 p-1.5 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity"
                        title="Compare player"
                      >
                        <GitCompare size={14} />
                      </button>
                    )}
                  </div>

                  <div className="hidden md:block font-mono text-xs uppercase tracking-widest opacity-70">
                    {POSITION_MAP[player.element_type]}
                  </div>

                  <div className="hidden md:flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-bold">{player.fplForm}</span>
                    {player.fplForm > 5 ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : player.fplForm < 2 ? <ArrowDownRight className="w-4 h-4 text-rose-500" /> : null}
                  </div>

                  <div className="hidden md:flex items-center justify-center gap-2">
                    <span className={`font-mono text-sm font-bold ${Math.round(player.fdr) <= 2 ? 'text-emerald-500' : Math.round(player.fdr) >= 4 ? 'text-rose-500' : ''}`}>
                      {player.fdr}
                    </span>
                  </div>

                  <div className="flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-bold text-emerald-500">{player.valueScore}</span>
                  </div>

                  <div className="hidden md:block font-mono text-xs text-center opacity-80">
                    £{(player.now_cost / 10).toFixed(1)}m
                  </div>

                  <div className="hidden md:flex items-center justify-center gap-2">
                    <span className="font-mono text-sm font-bold text-amber-500">{player.valueEfficiency}</span>
                  </div>

                  <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.goals}</div>
                  <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.assists}</div>
                  <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.cleanSheets}</div>
                  <div className="hidden md:block font-mono text-sm opacity-80">{player.metrics.bonus}</div>

                  <div className="hidden md:flex flex-col items-center justify-center gap-0.5">
                    <span className="font-mono text-sm font-bold text-blue-500">{player.perfProfile ? player.perfProfile.base_pp90 : '-'}</span>
                    {playerSummaries[player.id]?.history && (
                      <Sparkline history={playerSummaries[player.id].history} />
                    )}
                  </div>

                  <div className="flex justify-center gap-1">
                    {upcoming.map((f, i) => (
                      <div
                        key={i}
                        className={`w-6 md:w-8 ${i >= 3 ? 'max-md:hidden' : ''} flex flex-col items-center justify-center font-mono border
                          ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20 h-6 md:h-8' : getFDRColor(f.difficulty)}
                          ${f.isDouble ? 'py-0.5 gap-px' : 'h-6 md:h-8'}`}
                        title={f.isBlank ? `GW ${f.event}: BLANK` : f.opponents?.map(o => `${o.name} (${o.isHome ? 'H' : 'A'})`).join(' + ') ?? ''}
                      >
                        {f.isBlank ? (
                          <span className="text-[9px] md:text-[10px]">{f.opponent.toLowerCase()}</span>
                        ) : f.isDouble && f.opponents ? (
                          f.opponents.map((o, oi) => (
                            <span key={oi} className={`text-[8px] md:text-[9px] leading-tight ${oi === 1 ? 'opacity-70' : ''}`}>
                              {o.isHome ? o.name.toUpperCase() : o.name.toLowerCase()}
                            </span>
                          ))
                        ) : (
                          <span className="text-[9px] md:text-[10px]">
                            {f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                          </span>
                        )}
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
                                {player.web_name} has an FPL form rating of {player.fplForm}
                                {player.metrics.isPPAAdjusted ? ` (${player.metrics.ppa} points per appearance, adjusted for injury layoff)` : ""}.
                                With an FDR of {player.fdr}, they are a
                                {player.fplForm > 5 && player.fdr < 2.5 ? " prime transfer target." :
                                  player.fplForm > 5 ? " high-form asset with challenging fixtures." :
                                    player.fdr < 2.5 ? " potential differential with easy games." : " standard asset."}
                              </p>
                            </div>
                          </div>
                        </div>

                        {(() => {
                          const isMidOrFwd = player.element_type === 3 || player.element_type === 4;
                          const isGkOrDef = player.element_type === 1 || player.element_type === 2;
                          const xG = parseFloat(player.expected_goals ?? '0');
                          const xA = parseFloat(player.expected_assists ?? '0');
                          const xGC90 = player.expected_goals_conceded_per_90 ?? 0;
                          const goals = player.goals_scored ?? 0;
                          const assists = player.assists ?? 0;
                          const LEAGUE_AVG_XGC90 = 1.15;

                          if (!isMidOrFwd && !isGkOrDef) return null;
                          return (
                            <div className="md:col-span-3 border-t border-[#E4E3E0]/20 pt-6 mt-2">
                              <h4 className="font-serif italic text-xl mb-4 pb-2 border-b border-[#E4E3E0]/20">Expected Stats</h4>
                              {isMidOrFwd ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Goals vs xG */}
                                  <div className="bg-white/5 border border-white/10 p-4">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-3">Goals vs xG</div>
                                    <div className="flex items-end gap-4">
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] opacity-50 mb-1">ACTUAL</span>
                                        <span className="text-3xl font-bold">{goals}</span>
                                      </div>
                                      <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] opacity-50 mb-1">xG</span>
                                        <span className="text-3xl font-bold opacity-60">{xG.toFixed(1)}</span>
                                      </div>
                                      <div className="ml-auto flex flex-col items-end">
                                        {goals > xG * 1.3 ? (
                                          <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">↑ Overperforming</span>
                                        ) : goals < xG * 0.7 ? (
                                          <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">↓ Underperforming</span>
                                        ) : (
                                          <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">On Track</span>
                                        )}
                                        <span className="font-mono text-[10px] opacity-40 mt-1">{goals > 0 || xG > 0 ? `${((goals / Math.max(xG, 0.01)) * 100).toFixed(0)}% conversion of xG` : '—'}</span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Assists vs xA */}
                                  <div className="bg-white/5 border border-white/10 p-4">
                                    <div className="font-mono text-[10px] opacity-50 uppercase mb-3">Assists vs xA</div>
                                    <div className="flex items-end gap-4">
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] opacity-50 mb-1">ACTUAL</span>
                                        <span className="text-3xl font-bold">{assists}</span>
                                      </div>
                                      <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                                      <div className="flex flex-col">
                                        <span className="font-mono text-[10px] opacity-50 mb-1">xA</span>
                                        <span className="text-3xl font-bold opacity-60">{xA.toFixed(1)}</span>
                                      </div>
                                      <div className="ml-auto flex flex-col items-end">
                                        {assists > xA * 1.3 ? (
                                          <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">↑ Overperforming</span>
                                        ) : assists < xA * 0.7 ? (
                                          <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">↓ Underperforming</span>
                                        ) : (
                                          <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">On Track</span>
                                        )}
                                        <span className="font-mono text-[10px] opacity-40 mt-1">{assists > 0 || xA > 0 ? `${((assists / Math.max(xA, 0.01)) * 100).toFixed(0)}% conversion of xA` : '—'}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-white/5 border border-white/10 p-4 max-w-sm">
                                  <div className="font-mono text-[10px] opacity-50 uppercase mb-3">xGC per 90</div>
                                  <div className="flex items-end gap-4">
                                    <div className="flex flex-col">
                                      <span className="font-mono text-[10px] opacity-50 mb-1">THIS PLAYER</span>
                                      <span className="text-3xl font-bold">{xGC90.toFixed(2)}</span>
                                    </div>
                                    <div className="font-mono text-lg opacity-30 mb-1">vs</div>
                                    <div className="flex flex-col">
                                      <span className="font-mono text-[10px] opacity-50 mb-1">LEAGUE AVG</span>
                                      <span className="text-3xl font-bold opacity-60">{LEAGUE_AVG_XGC90.toFixed(2)}</span>
                                    </div>
                                    <div className="ml-auto flex flex-col items-end">
                                      {xGC90 < LEAGUE_AVG_XGC90 * 0.8 ? (
                                        <span className="text-teal-400 font-mono text-[10px] uppercase tracking-widest">Strong CS Chance</span>
                                      ) : xGC90 > LEAGUE_AVG_XGC90 * 1.2 ? (
                                        <span className="text-orange-400 font-mono text-[10px] uppercase tracking-widest">Weak Defence</span>
                                      ) : (
                                        <span className="text-white/40 font-mono text-[10px] uppercase tracking-widest">Average</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

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

        {displayedPlayers.length > visibleCount && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setVisibleCount(prev => prev + 50)}
              className="px-12 py-4 border border-[#141414] font-mono text-[10px] uppercase tracking-widest hover:bg-[#141414] hover:text-[#E4E3E0] transition-all"
            >
              Show More Results ({displayedPlayers.length - visibleCount} Remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
};
