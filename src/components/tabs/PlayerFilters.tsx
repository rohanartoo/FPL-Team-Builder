import React, { useState } from "react";
import { Search, X, Crosshair } from "lucide-react";
import { Team } from "../../types";
import { getTeamShortName } from "../../utils/team";

interface PlayerFiltersProps {
  teams: Team[];
  teamFilter: number | null;
  setTeamFilter: (id: number | null) => void;
  positionFilter: number;
  setPositionFilter: (pos: number) => void;
  activeSignals: Set<string>;
  setActiveSignals: React.Dispatch<React.SetStateAction<Set<string>>>;
  activeArchetypes: Set<string>;
  setActiveArchetypes: React.Dispatch<React.SetStateAction<Set<string>>>;
  minPrice: number;
  setMinPrice: (p: number) => void;
  maxPrice: number | null;
  setMaxPrice: (p: number | null) => void;
  maxPlayerPrice: number;
  priceOptions: number[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  setVisibleCount: (n: number) => void;
}

export const PlayerFilters = ({
  teams,
  teamFilter,
  setTeamFilter,
  positionFilter,
  setPositionFilter,
  activeSignals,
  setActiveSignals,
  activeArchetypes,
  setActiveArchetypes,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  maxPlayerPrice,
  priceOptions,
  searchQuery,
  setSearchQuery,
  setVisibleCount,
}: PlayerFiltersProps) => {
  const [showPositions, setShowPositions] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const [showArchetypes, setShowArchetypes] = useState(false);
  const [showPriceFilter, setShowPriceFilter] = useState(false);

  const effectiveMaxPrice = maxPrice ?? maxPlayerPrice;
  const isPriceFilterActive = minPrice !== 3.0 || (maxPrice !== null && maxPrice !== maxPlayerPrice);

  const toggleSignal = (signal: string) => {
    setActiveSignals(prev => {
      const next = new Set(prev);
      if (next.has(signal)) next.delete(signal); else next.add(signal);
      return next;
    });
    setVisibleCount(50);
  };

  const toggleArchetype = (archetype: string) => {
    setActiveArchetypes(prev => {
      const next = new Set(prev);
      if (next.has(archetype)) next.delete(archetype); else next.add(archetype);
      return next;
    });
    setVisibleCount(50);
  };

  const posLabels: Record<number, string> = { 0: 'ALL', 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

  return (
    <div className="max-w-7xl mx-auto mb-8">
      <div className="flex flex-col gap-2 mb-6">
        {/* Team filter chip */}
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
          <button
            onClick={() => setShowPositions(p => !p)}
            className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
              ${positionFilter !== 0 ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
          >
            Position: {posLabels[positionFilter]}
            <span className="opacity-60">{showPositions ? '▴' : '▾'}</span>
          </button>

          {/* Signals pill */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSignals(p => !p)}
              className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                ${activeSignals.size > 0 ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
            >
              {activeSignals.size > 0 ? `Signals (${activeSignals.size})` : 'Signals'}
              <span className="opacity-60">{showSignals ? '▴' : '▾'}</span>
            </button>
            {activeSignals.size > 0 && (
              <button
                onClick={() => { setActiveSignals(new Set()); setVisibleCount(50); }}
                className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                title="Clear signal filters"
              >
                <X size={12} className="opacity-60 hover:opacity-100" />
              </button>
            )}
          </div>

          {/* Archetypes pill */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowArchetypes(p => !p)}
              className={`flex items-center gap-2 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest transition-all
                ${activeArchetypes.size > 0 ? 'bg-[#141414] text-[#E4E3E0] border-[#141414]' : 'border-[#141414] hover:bg-[#141414]/5'}`}
            >
              {activeArchetypes.size > 0 ? `Archetype (${activeArchetypes.size})` : 'Archetype'}
              <span className="opacity-60">{showArchetypes ? '▴' : '▾'}</span>
            </button>
            {activeArchetypes.size > 0 && (
              <button
                onClick={() => { setActiveArchetypes(new Set()); setVisibleCount(50); }}
                className="p-2 border border-[#141414] hover:bg-[#141414]/5 transition-colors"
                title="Clear archetype filter"
              >
                <X size={12} className="opacity-60 hover:opacity-100" />
              </button>
            )}
          </div>

          {/* Price filter pill */}
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
        </div>

        {/* Position options */}
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
                onClick={() => { setPositionFilter(pos.id); setVisibleCount(50); setShowPositions(false); }}
                className={`px-5 py-2 border border-[#141414] font-mono text-[10px] uppercase tracking-widest transition-all
                  ${positionFilter === pos.id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#141414]/10'}`}
              >
                {pos.label}
              </button>
            ))}
          </div>
        )}

        {/* Signal options */}
        {showSignals && (
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'ftb',        label: 'FTB Run',         activeClass: 'bg-orange-500 border-orange-500 text-white',   inactiveClass: 'border-orange-400 text-orange-600 hover:bg-orange-50' },
              { key: 'form',       label: 'Form Run',        activeClass: 'bg-emerald-600 border-emerald-600 text-white', inactiveClass: 'border-emerald-400 text-emerald-600 hover:bg-emerald-50' },
              { key: 'gem',        label: 'Hidden Gem',      activeClass: 'bg-violet-600 border-violet-600 text-white',   inactiveClass: 'border-violet-400 text-violet-600 hover:bg-violet-50' },
              { key: 'price',      label: 'Price Rise',      activeClass: 'bg-sky-600 border-sky-600 text-white',         inactiveClass: 'border-sky-400 text-sky-600 hover:bg-sky-50' },
              { key: 'booking',    label: 'Booking Risk',    activeClass: 'bg-red-600 border-red-600 text-white',         inactiveClass: 'border-red-400 text-red-600 hover:bg-red-50' },
              { key: 'dueagoal',   label: 'Due a Goal',      activeClass: 'bg-yellow-500 border-yellow-500 text-white',   inactiveClass: 'border-yellow-500 text-yellow-600 hover:bg-yellow-50' },
              { key: 'regression', label: 'Regression Risk', activeClass: 'bg-fuchsia-600 border-fuchsia-600 text-white', inactiveClass: 'border-fuchsia-400 text-fuchsia-600 hover:bg-fuchsia-50' },
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

        {/* Archetype options */}
        {showArchetypes && (
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'Talisman',         activeClass: 'bg-emerald-600 border-emerald-600 text-white', inactiveClass: 'border-emerald-400 text-emerald-600 hover:bg-emerald-50' },
              { key: 'Flat Track Bully', activeClass: 'bg-amber-500 border-amber-500 text-white',    inactiveClass: 'border-amber-400 text-amber-600 hover:bg-amber-50' },
              { key: 'Workhorse',        activeClass: 'bg-sky-600 border-sky-600 text-white',         inactiveClass: 'border-sky-400 text-sky-600 hover:bg-sky-50' },
              { key: 'Rotation Risk',    activeClass: 'bg-orange-500 border-orange-500 text-white',   inactiveClass: 'border-orange-400 text-orange-600 hover:bg-orange-50' },
              { key: 'Squad Player',     activeClass: 'bg-slate-600 border-slate-600 text-white',     inactiveClass: 'border-slate-400 text-slate-600 hover:bg-slate-50' },
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

        {/* Price filter */}
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

      {/* Search */}
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
  );
};
