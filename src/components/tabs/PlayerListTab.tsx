import React, { useState, useMemo } from "react";
import { Player, Team, Fixture, PlayerSummary } from "../../types";
import { computePositionThresholds } from "../../utils/playerThresholds";
import { getPlayerFlags } from "../../utils/playerSignals";
import { PlayerFilters } from "./PlayerFilters";
import { PlayerRow } from "./PlayerRow";

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
  const [activeArchetypes, setActiveArchetypes] = useState<Set<string>>(new Set());
  const [minPrice, setMinPrice] = useState(3.0);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);

  const maxPlayerPrice = useMemo(() => {
    if (processedPlayers.length === 0) return 15.0;
    return Math.ceil((Math.max(...processedPlayers.map(p => p.now_cost / 10)) * 10)) / 10;
  }, [processedPlayers]);

  const priceOptions = useMemo(() => {
    const options: number[] = [];
    for (let p = 3.0; p <= maxPlayerPrice + 0.01; p = Math.round((p + 0.2) * 10) / 10) {
      options.push(p);
    }
    return options;
  }, [maxPlayerPrice]);

  const positionThresholds = useMemo(
    () => computePositionThresholds(processedPlayers),
    [processedPlayers]
  );

  const playerFlagsMap = useMemo(() => {
    const map = new Map<number, ReturnType<typeof getPlayerFlags>>();
    for (const p of processedPlayers) {
      map.set(p.id, getPlayerFlags(p, fixtures, teams, tfdrMap, positionThresholds, currentGW));
    }
    return map;
  }, [processedPlayers, fixtures, teams, tfdrMap, positionThresholds, currentGW]);

  const effectiveMaxPrice = maxPrice ?? maxPlayerPrice;

  const displayedPlayers = processedPlayers.filter(p => {
    if (activeSignals.size > 0) {
      const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = playerFlagsMap.get(p.id)!;
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

  const handleSort = (key: string) => {
    setSortConfig((prev: any) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  return (
    <>
      <PlayerFilters
        teams={teams}
        teamFilter={teamFilter}
        setTeamFilter={setTeamFilter}
        positionFilter={positionFilter}
        setPositionFilter={setPositionFilter}
        activeSignals={activeSignals}
        setActiveSignals={setActiveSignals}
        activeArchetypes={activeArchetypes}
        setActiveArchetypes={setActiveArchetypes}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        maxPlayerPrice={maxPlayerPrice}
        priceOptions={priceOptions}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        setVisibleCount={setVisibleCount}
      />

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
          {filteredAndSlicedPlayers.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              isExpanded={expandedPlayer === player.id}
              onToggle={() => {
                setExpandedPlayer(expandedPlayer === player.id ? null : player.id);
                fetchPlayerSummary(player.id);
              }}
              playerSummaries={playerSummaries}
              fixtures={fixtures}
              teams={teams}
              tfdrMap={tfdrMap}
              flags={playerFlagsMap.get(player.id)!}
              onCompare={onCompare}
            />
          ))}
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
