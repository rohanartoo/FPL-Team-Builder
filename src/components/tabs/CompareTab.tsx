import React, { useState, useMemo, useRef, useEffect } from "react";
import { Search, GitCompare, X, AlertTriangle } from "lucide-react";
import { Team, Fixture, PlayerSummary, POSITION_MAP } from "../../types";
import { getNextFixtures } from "../../utils/fixtures";
import { getFDRColor } from "../../utils/player";
import { getTeamName, getTeamShortName } from "../../utils/team";
import { computePositionThresholds } from "../../utils/playerThresholds";
import { getPlayerFlags } from "../../utils/playerSignals";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
interface CompareTabProps {
  processedPlayers: any[];
  comparePlayerIds: [number | null, number | null];
  setComparePlayerIds: (ids: [number | null, number | null]) => void;
  playerSummaries: Record<number, PlayerSummary>;
  fetchPlayerSummary: (id: number) => void;
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
  currentGW: number;
}

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------
const ARCHETYPE_BADGE: Record<string, string> = {
  "Talisman":        "bg-violet-500/15 text-violet-700 border border-violet-500/30",
  "Flat Track Bully":"bg-orange-500/15 text-orange-700 border border-orange-500/30",
  "Workhorse":       "bg-sky-500/15    text-sky-700    border border-sky-500/30",
  "Rotation Risk":   "bg-orange-500/15 text-orange-700 border border-orange-500/30",
  "Squad Player":    "bg-[#141414]/5   text-[#141414]/50 border border-[#141414]/20",
  "Not Enough Data": "bg-[#141414]/5   text-[#141414]/30 border border-[#141414]/10",
};

const POSITION_COLORS: Record<number, string> = {
  1: "text-yellow-500",
  2: "text-blue-500",
  3: "text-emerald-500",
  4: "text-rose-500",
};

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
function compareVals(a: number | null, b: number | null, higherIsBetter = true) {
  if (a === null || b === null || a === b) return { aWins: false, bWins: false };
  return higherIsBetter
    ? { aWins: a > b, bWins: b > a }
    : { aWins: a < b, bWins: b < a };
}

const fmt1 = (v: number | null) => (v === null ? "—" : v.toFixed(1));
const fmt2 = (v: number | null) => (v === null ? "—" : v.toFixed(2));
const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
const fmtInt = (v: number | null) => (v === null ? "—" : String(Math.round(v)));

// ---------------------------------------------------------------
// CompareRow — one metric row
// ---------------------------------------------------------------
const CompareRow = ({
  label,
  aVal,
  bVal,
  higherIsBetter = true,
  formatter = fmt1,
  noWinner = false,
  note,
}: {
  label: string;
  aVal: number | null;
  bVal: number | null;
  higherIsBetter?: boolean;
  formatter?: (v: number | null) => string;
  noWinner?: boolean;
  note?: string;
}) => {
  const { aWins, bWins } = noWinner ? { aWins: false, bWins: false } : compareVals(aVal, bVal, higherIsBetter);
  return (
    <div className="grid grid-cols-[1fr_160px_1fr] items-center py-3 border-b border-[#141414]/10">
      <div className={`text-right pr-6 font-mono text-xl font-bold tabular-nums ${aWins ? "text-emerald-500" : bWins ? "opacity-30" : ""}`}>
        {aWins && <span className="mr-1.5 text-xs text-emerald-500">▲</span>}
        {formatter(aVal)}
      </div>
      <div className="text-center px-2">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] opacity-50">{label}</div>
        {note && <div className="font-mono text-[8px] opacity-30 mt-0.5">{note}</div>}
      </div>
      <div className={`text-left pl-6 font-mono text-xl font-bold tabular-nums ${bWins ? "text-emerald-500" : aWins ? "opacity-30" : ""}`}>
        {bWins && <span className="mr-1.5 text-xs text-emerald-500">▲</span>}
        {formatter(bVal)}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------
const SectionHeader = ({ title }: { title: string }) => (
  <div className="mt-10 mb-1 pb-2 border-b-2 border-[#141414]">
    <span className="font-serif italic text-base opacity-80">{title}</span>
  </div>
);

// ---------------------------------------------------------------
// PlayerSelector — searchable dropdown
// ---------------------------------------------------------------
const PlayerSelector = ({
  selectedId,
  onSelect,
  players,
  teams,
  positionFilter,
  label,
}: {
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  players: any[];
  teams: Team[];
  positionFilter: number;
  label: string;
}) => {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = players.find(p => p.id === selectedId);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return players
      .filter(p => {
        const matchPos = positionFilter === 0 || p.element_type === positionFilter;
        const matchSearch = !q ||
          p.web_name.toLowerCase().includes(q) ||
          (teams.find(t => t.id === p.team)?.name.toLowerCase().includes(q) ?? false);
        return matchPos && matchSearch;
      })
      .slice(0, 8);
  }, [players, search, positionFilter, teams]);

  if (selected) {
    return (
      <div className="border border-[#141414] p-4 flex items-start justify-between gap-4 bg-[#141414] text-[#E4E3E0] min-h-[64px]">
        <div>
          <div className="font-bold text-lg tracking-tight leading-none mb-1">{selected.web_name}</div>
          <div className="font-mono text-[10px] uppercase opacity-50 tracking-wider">
            {getTeamName(teams, selected.team)} · {POSITION_MAP[selected.element_type]} · £{(selected.now_cost / 10).toFixed(1)}m
          </div>
        </div>
        <button onClick={() => onSelect(null)} className="p-1 opacity-50 hover:opacity-100 transition-opacity shrink-0">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="border border-[#141414] p-4 flex items-center gap-3 min-h-[64px]">
        <Search size={14} className="opacity-30 shrink-0" />
        <input
          type="text"
          placeholder={label}
          value={search}
          onChange={e => { setSearch(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          className="flex-1 bg-transparent font-mono text-xs uppercase tracking-widest focus:outline-none placeholder:opacity-30"
        />
      </div>
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-20 border border-[#141414] border-t-0 bg-[#E4E3E0] max-h-64 overflow-y-auto shadow-lg">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); setSearch(""); setIsOpen(false); }}
              className="w-full text-left px-4 py-3 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors border-b border-[#141414]/10 last:border-b-0"
            >
              <div className="font-bold text-sm tracking-tight">{p.web_name}</div>
              <div className="font-mono text-[9px] uppercase opacity-50 mt-0.5">
                {getTeamShortName(teams, p.team)} · {POSITION_MAP[p.element_type]} · £{(p.now_cost / 10).toFixed(1)}m
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------
export const CompareTab = ({
  processedPlayers,
  comparePlayerIds,
  setComparePlayerIds,
  fetchPlayerSummary,
  fixtures,
  teams,
  tfdrMap,
  currentGW,
}: CompareTabProps) => {
  const [positionFilter, setPositionFilter] = useState<number>(0);

  const [idA, idB] = comparePlayerIds;
  const playerA = processedPlayers.find(p => p.id === idA) ?? null;
  const playerB = processedPlayers.find(p => p.id === idB) ?? null;

  const handleSelectA = (id: number | null) => {
    const p = id ? processedPlayers.find(pl => pl.id === id) : null;
    if (p) setPositionFilter(p.element_type);
    setComparePlayerIds([id, comparePlayerIds[1]]);
    if (id) fetchPlayerSummary(id);
  };

  const handleSelectB = (id: number | null) => {
    setComparePlayerIds([comparePlayerIds[0], id]);
    if (id) fetchPlayerSummary(id);
  };

  const crossPosition = !!(playerA && playerB && playerA.element_type !== playerB.element_type);

  const positionThresholds = useMemo(() => computePositionThresholds(processedPlayers), [processedPlayers]);

  const renderFlags = (player: any) => {
    const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = getPlayerFlags(player, fixtures, teams, tfdrMap, positionThresholds, currentGW ?? 1);
    const dots = [
      isFTBRun         && { color: "bg-orange-500",  label: "FTB Run" },
      isFormRun        && { color: "bg-emerald-500",  label: "Form Run" },
      isHiddenGem      && { color: "bg-violet-500",   label: "Hidden Gem" },
      isPriceRise      && { color: "bg-sky-500",      label: "Price Rise" },
      isBookingRisk    && { color: "bg-red-500",      label: "Booking Risk" },
      isDueAGoal       && { color: "bg-yellow-500",  label: "Due a Goal" },
      isRegressionRisk && { color: "bg-fuchsia-500", label: "Regression Risk" },
    ].filter(Boolean) as { color: string; label: string }[];
    if (!dots.length) return null;
    return (
      <div className="flex gap-1.5 mt-2 flex-wrap">
        {dots.map((d, i) => (
          <span key={i} className="inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-widest opacity-70">
            <span className={`w-2 h-2 rounded-full shrink-0 ${d.color}`} />
            {d.label}
          </span>
        ))}
      </div>
    );
  };

  const upcomingA = playerA
    ? getNextFixtures(playerA.team, fixtures, teams, tfdrMap, 5, 0, playerA.element_type)
    : [];
  const upcomingB = playerB
    ? getNextFixtures(playerB.team, fixtures, teams, tfdrMap, 5, 0, playerB.element_type)
    : [];

  const isMidFwdA = playerA && (playerA.element_type === 3 || playerA.element_type === 4);
  const isMidFwdB = playerB && (playerB.element_type === 3 || playerB.element_type === 4);
  const isGkDefA = playerA && (playerA.element_type === 1 || playerA.element_type === 2);
  const isGkDefB = playerB && (playerB.element_type === 1 || playerB.element_type === 2);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-10">
        <h2 className="font-serif italic text-4xl tracking-tighter mb-1">Player Comparison</h2>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-40">
          Side-by-side analysis — archetype, value, fixture dependency, and underlying expected output
        </p>
      </div>

      {/* Position filter */}
      <div className="flex gap-2 mb-4">
        {([
          { id: 0, label: "ALL" },
          { id: 1, label: "GK" },
          { id: 2, label: "DEF" },
          { id: 3, label: "MID" },
          { id: 4, label: "FWD" },
        ] as { id: number; label: string }[]).map(pos => (
          <button
            key={pos.id}
            onClick={() => setPositionFilter(pos.id)}
            className={`px-4 py-2 border font-mono text-[10px] uppercase tracking-widest transition-all
              ${positionFilter === pos.id
                ? "bg-[#141414] text-[#E4E3E0] border-[#141414]"
                : "border-[#141414] hover:bg-[#141414]/5"}`}
          >
            {pos.label}
          </button>
        ))}
      </div>

      {/* Player selectors */}
      <div className="grid grid-cols-[1fr_44px_1fr] mb-8">
        <PlayerSelector
          selectedId={idA}
          onSelect={handleSelectA}
          players={processedPlayers}
          teams={teams}
          positionFilter={positionFilter}
          label="Search Player A..."
        />
        <div className="flex items-center justify-center border-t border-b border-[#141414]">
          <span className="font-serif italic text-xs opacity-30">vs</span>
        </div>
        <PlayerSelector
          selectedId={idB}
          onSelect={handleSelectB}
          players={processedPlayers}
          teams={teams}
          positionFilter={positionFilter}
          label="Search Player B..."
        />
      </div>

      {/* Cross-position warning */}
      {crossPosition && (
        <div className="flex items-center gap-3 p-4 border border-amber-500/30 bg-amber-500/5 mb-8 font-mono text-[10px] uppercase tracking-widest text-amber-700">
          <AlertTriangle size={14} className="shrink-0" />
          Comparing across positions — some metrics may not be directly comparable
        </div>
      )}

      {/* Empty state */}
      {(!playerA || !playerB) && (
        <div className="text-center py-24 opacity-20">
          <GitCompare size={44} className="mx-auto mb-4" />
          <p className="font-mono text-xs uppercase tracking-widest">Select two players to begin comparison</p>
        </div>
      )}

      {/* Comparison content */}
      {playerA && playerB && (
        <>
          {/* Column headers — archetype + signals */}
          <div className="grid grid-cols-[1fr_160px_1fr] mb-2 mt-4">
            <div className="pr-6 text-right">
              {playerA.perfProfile?.archetype && (
                <span className={`inline-block font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 mb-2 ${ARCHETYPE_BADGE[playerA.perfProfile.archetype] ?? ""}`}>
                  {playerA.perfProfile.archetype}
                </span>
              )}
              <div className={`font-mono text-[9px] uppercase tracking-widest ${POSITION_COLORS[playerA.element_type]}`}>
                {POSITION_MAP[playerA.element_type]} · {getTeamShortName(teams, playerA.team)}
              </div>
              <div className="flex justify-end">{renderFlags(playerA)}</div>
            </div>
            <div />
            <div className="pl-6 text-left">
              {playerB.perfProfile?.archetype && (
                <span className={`inline-block font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 mb-2 ${ARCHETYPE_BADGE[playerB.perfProfile.archetype] ?? ""}`}>
                  {playerB.perfProfile.archetype}
                </span>
              )}
              <div className={`font-mono text-[9px] uppercase tracking-widest ${POSITION_COLORS[playerB.element_type]}`}>
                {POSITION_MAP[playerB.element_type]} · {getTeamShortName(teams, playerB.team)}
              </div>
              {renderFlags(playerB)}
            </div>
          </div>

          {/* Section: Value */}
          <SectionHeader title="Value" />
          <CompareRow label="Value Score"   aVal={playerA.valueScore}       bVal={playerB.valueScore} />
          <CompareRow label="Value / £1m"   aVal={playerA.valueEfficiency}  bVal={playerB.valueEfficiency} formatter={fmt2} />
          <CompareRow
            label="Price (£m)"
            aVal={playerA.now_cost / 10}
            bVal={playerB.now_cost / 10}
            higherIsBetter={false}
            formatter={fmt1}
            noWinner
          />
          <CompareRow
            label="Ownership %"
            aVal={parseFloat(playerA.selected_by_percent)}
            bVal={parseFloat(playerB.selected_by_percent)}
            formatter={v => v === null ? "—" : `${v.toFixed(1)}%`}
            noWinner
          />

          {/* Section: Reliability & Quality */}
          <SectionHeader title="Reliability & Quality" />
          <CompareRow
            label="Reliability"
            aVal={playerA.perfProfile?.reliability_score ?? null}
            bVal={playerB.perfProfile?.reliability_score ?? null}
            formatter={fmtPct}
          />
          <CompareRow
            label="Season PP90"
            aVal={playerA.perfProfile?.base_pp90 ?? null}
            bVal={playerB.perfProfile?.base_pp90 ?? null}
          />
          <CompareRow label="FPL Form" aVal={playerA.fplForm} bVal={playerB.fplForm} />
          <CompareRow label="Total Mins"    aVal={playerA.minutes}     bVal={playerB.minutes} formatter={fmtInt} />

          {/* Section: PP90 by Fixture Difficulty */}
          <SectionHeader title="PP90 by Fixture Difficulty" />
          <CompareRow label="Easy (FDR 2)"      aVal={playerA.perfProfile?.pp90_fdr2 ?? null} bVal={playerB.perfProfile?.pp90_fdr2 ?? null} />
          <CompareRow label="Neutral (FDR 3)"   aVal={playerA.perfProfile?.pp90_fdr3 ?? null} bVal={playerB.perfProfile?.pp90_fdr3 ?? null} />
          <CompareRow label="Hard (FDR 4)"      aVal={playerA.perfProfile?.pp90_fdr4 ?? null} bVal={playerB.perfProfile?.pp90_fdr4 ?? null} />
          <CompareRow label="Very Hard (FDR 5)" aVal={playerA.perfProfile?.pp90_fdr5 ?? null} bVal={playerB.perfProfile?.pp90_fdr5 ?? null} />

          {/* Section: Expected Output (MID/FWD) */}
          {(isMidFwdA || isMidFwdB) && (
            <>
              <SectionHeader title="Expected Attacking Output" />
              <CompareRow
                label="xG / 90"
                aVal={isMidFwdA ? (playerA.expected_goals_per_90 ?? null) : null}
                bVal={isMidFwdB ? (playerB.expected_goals_per_90 ?? null) : null}
                formatter={v => v === null ? "N/A" : v.toFixed(2)}
              />
              <CompareRow
                label="xA / 90"
                aVal={isMidFwdA ? (playerA.expected_assists_per_90 ?? null) : null}
                bVal={isMidFwdB ? (playerB.expected_assists_per_90 ?? null) : null}
                formatter={v => v === null ? "N/A" : v.toFixed(2)}
              />
              <CompareRow
                label="xGI / 90"
                aVal={isMidFwdA ? ((playerA.expected_goals_per_90 ?? 0) + (playerA.expected_assists_per_90 ?? 0)) : null}
                bVal={isMidFwdB ? ((playerB.expected_goals_per_90 ?? 0) + (playerB.expected_assists_per_90 ?? 0)) : null}
                formatter={v => v === null ? "N/A" : v.toFixed(2)}
              />
              <CompareRow
                label="Goals vs xG"
                aVal={isMidFwdA ? ((playerA.goals_scored ?? 0) - parseFloat(playerA.expected_goals ?? "0")) : null}
                bVal={isMidFwdB ? ((playerB.goals_scored ?? 0) - parseFloat(playerB.expected_goals ?? "0")) : null}
                formatter={v => v === null ? "N/A" : (v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
                noWinner
                note="+ overperforming · − underperforming"
              />
            </>
          )}

          {/* Section: Expected Defensive Output (GK/DEF) */}
          {(isGkDefA || isGkDefB) && (
            <>
              <SectionHeader title="Expected Defensive Output" />
              <CompareRow
                label="xGC / 90"
                aVal={isGkDefA ? (playerA.expected_goals_conceded_per_90 ?? null) : null}
                bVal={isGkDefB ? (playerB.expected_goals_conceded_per_90 ?? null) : null}
                higherIsBetter={false}
                formatter={v => v === null ? "N/A" : v.toFixed(2)}
                note="lower = better"
              />
            </>
          )}

          {/* Section: Upcoming Fixtures */}
          <SectionHeader title="Upcoming Fixtures" />
          <div className="grid grid-cols-[1fr_160px_1fr] pt-2 pb-6">
            <div className="flex flex-col gap-1.5 pr-6">
              {upcomingA.map((f, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-end gap-2 px-3 py-2 font-mono text-[11px] border ${getFDRColor(f.difficulty)} ${f.isBlank ? "opacity-25" : ""}`}
                >
                  <span className="opacity-50 text-[9px]">GW{f.event}</span>
                  <span className="font-bold tracking-wide">
                    {f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                  </span>
                  <span className="opacity-50">({f.isHome ? "H" : "A"})</span>
                </div>
              ))}
            </div>
            <div className="flex items-start justify-center pt-2">
              <div className="flex flex-col gap-1.5 w-full">
                {upcomingA.map((_, i) => (
                  <div key={i} className="h-[36px] flex items-center justify-center font-mono text-[9px] opacity-20">
                    GW{upcomingA[i]?.event}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5 pl-6">
              {upcomingB.map((f, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-3 py-2 font-mono text-[11px] border ${getFDRColor(f.difficulty)} ${f.isBlank ? "opacity-25" : ""}`}
                >
                  <span className="opacity-50 text-[9px]">GW{f.event}</span>
                  <span className="font-bold tracking-wide">
                    {f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}
                  </span>
                  <span className="opacity-50">({f.isHome ? "H" : "A"})</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
