import { useState, useMemo, useEffect, useRef } from "react";
import { X, Plus, ArrowRight, RotateCcw, Search, Clock } from "lucide-react";
import { POSITION_MAP } from "../../../types";
import { getTeamShortName } from "../../../utils/team";

// ─── Hit Payoff Helper ────────────────────────────────────────────────────────

function getPayoff(outPlayer: any, inPlayer: any, hitCostPts: number): {
  gws: number | null;
  label: string;
  color: string;
  bg: string;
  border: string;
} {
  const delta = (inPlayer?.valueScore ?? 0) - (outPlayer?.valueScore ?? 0);
  if (delta <= 0) return {
    gws: null,
    label: "Hit never pays off — incoming player underperforms current",
    color: "text-rose-600", bg: "bg-rose-500/5", border: "border-rose-500/30",
  };
  const gws = Math.ceil(hitCostPts / delta);
  const color = gws <= 2 ? "text-emerald-600" : gws <= 4 ? "text-amber-600" : "text-rose-600";
  const bg = gws <= 2 ? "bg-emerald-500/5" : gws <= 4 ? "bg-amber-500/5" : "bg-rose-500/5";
  const border = gws <= 2 ? "border-emerald-500/30" : gws <= 4 ? "border-amber-500/30" : "border-rose-500/30";
  return {
    gws,
    label: `Hit pays off in ~${gws} GW${gws !== 1 ? "s" : ""} · ${inPlayer.web_name} (+${delta.toFixed(1)}) vs ${outPlayer.web_name} (+${(outPlayer.valueScore ?? 0).toFixed(1)})`,
    color, bg, border,
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlannedTransfer {
  id: string;
  outId: number | null;
  inId: number | null;
}

interface GWPlan {
  gw: number;
  transfers: PlannedTransfer[];
}

interface DerivedPlan extends GWPlan {
  ftsAvailable: number;
  transfersComplete: number;
  hitCost: number;
  bankAfter: number;
  avgValueBefore: number;
  avgValueAfter: number;
  valueDelta: number;
  squadState: any[];
  squadAfter: any[];
  bankedFT: number;
}

// ─── Player Picker ────────────────────────────────────────────────────────────

function PlayerPicker({
  label,
  selected,
  onSelect,
  options,
  teams,
  disabled = false,
}: {
  label: string;
  selected: any | null;
  onSelect: (p: any | null) => void;
  options: any[];
  teams: any[];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return options
      .filter(p => !q || p.web_name.toLowerCase().includes(q) ||
        (teams.find(t => t.id === p.team)?.short_name ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, query, teams]);

  if (selected) {
    return (
      <div className="flex items-center justify-between border border-[#141414] px-3 py-2 bg-[#141414] text-[#E4E3E0] min-w-[140px]">
        <div>
          <div className="font-bold text-xs">{selected.web_name}</div>
          <div className="font-mono text-[8px] opacity-50 uppercase">
            {getTeamShortName(teams, selected.team)} · £{(selected.now_cost / 10).toFixed(1)}m
          </div>
        </div>
        {!disabled && (
          <button onClick={() => onSelect(null)} className="ml-2 opacity-50 hover:opacity-100">
            <X size={11} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative min-w-[140px]">
      <button
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 border border-[#141414]/30 px-3 py-2 font-mono text-[9px] uppercase tracking-widest opacity-50 hover:opacity-100 hover:border-[#141414] transition-all disabled:cursor-not-allowed"
      >
        <Search size={10} />
        {label}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 w-56 border border-[#141414] bg-[#E4E3E0] shadow-lg">
          <div className="p-2 border-b border-[#141414]/10">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-transparent font-mono text-xs focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-3 font-mono text-[9px] opacity-40 text-center">No players found</div>
            ) : filtered.map(p => (
              <button
                key={p.id}
                onClick={() => { onSelect(p); setOpen(false); setQuery(""); }}
                className="w-full text-left px-3 py-2 hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors border-b border-[#141414]/10 last:border-0"
              >
                <div className="font-bold text-xs">{p.web_name}</div>
                <div className="font-mono text-[8px] opacity-50 flex gap-2">
                  <span>{getTeamShortName(teams, p.team)}</span>
                  <span>£{(p.now_cost / 10).toFixed(1)}m</span>
                  {p.valueScore && <span className="text-emerald-600">{p.valueScore.toFixed(1)}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GW Plan Card ─────────────────────────────────────────────────────────────

function GWPlanCard({
  derived,
  gwIdx,
  allPlayers,
  teams,
  onAdd,
  onRemove,
  onSetOut,
  onSetIn,
  maxTransfers,
}: {
  derived: DerivedPlan;
  gwIdx: number;
  allPlayers: any[];
  teams: any[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onSetOut: (transferId: string, player: any | null) => void;
  onSetIn: (transferId: string, player: any | null) => void;
  maxTransfers: number;
}) {
  const isHolding = derived.transfersComplete === 0;
  const hitColor = derived.hitCost > 0
    ? "border-rose-500/40 bg-rose-500/5"
    : isHolding
      ? "border-emerald-500/30 bg-emerald-500/5"
      : "border-[#141414]/20 bg-white/40";

  return (
    <div className={`border ${hitColor} transition-colors`}>
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest">GW{derived.gw}</span>
          <span className="font-mono text-[8px] border border-[#141414]/20 px-2 py-0.5 bg-[#141414] text-[#E4E3E0]">
            {derived.ftsAvailable} FT{derived.ftsAvailable !== 1 ? "s" : ""} available
          </span>
          {derived.hitCost > 0 && (
            <span className="font-mono text-[8px] border border-rose-500/30 bg-rose-500/10 text-rose-600 px-2 py-0.5">
              -{derived.hitCost} hit
            </span>
          )}
          {isHolding && derived.bankedFT > 0 && (
            <span className="font-mono text-[8px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 px-2 py-0.5">
              Banking FT → {derived.ftsAvailable + derived.bankedFT > 1 ? "2" : "1"} next GW
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {derived.valueDelta !== 0 && (
            <span className={`font-mono text-[9px] font-bold ${derived.valueDelta > 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {derived.valueDelta > 0 ? "+" : ""}{derived.valueDelta.toFixed(2)} avg value
            </span>
          )}
          <span className="font-mono text-[9px] opacity-40">£{derived.bankAfter.toFixed(1)}m bank</span>
        </div>
      </div>

      {/* Transfer rows */}
      <div className="px-4 py-3 space-y-2">
        {derived.transfers.map((transfer) => {
          const outPlayer = derived.squadState.find(p => p.id === transfer.outId) ?? null;
          const inPlayer = allPlayers.find(p => p.id === transfer.inId) ?? null;

          // Out options: squad members at this GW state
          const outOptions = derived.squadState;

          // In options: same position, not in squad, within budget
          const pos = outPlayer?.element_type;
          const budget = (derived.bankAfter + (outPlayer?.now_cost ?? 0) / 10);
          const squadIds = new Set(derived.squadState.map(p => p.id));
          const inOptions = pos
            ? allPlayers
                .filter(p => p.element_type === pos && !squadIds.has(p.id) && p.now_cost / 10 <= budget)
                .sort((a, b) => b.valueScore - a.valueScore)
            : [];

          const completeUpToHere = derived.transfers
            .slice(0, derived.transfers.findIndex(t => t.id === transfer.id) + 1)
            .filter(t => t.outId && t.inId).length;
          const isHittingTransfer = completeUpToHere > derived.ftsAvailable;

          return (
            <div key={transfer.id} className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <PlayerPicker
                  label="Transfer out..."
                  selected={outPlayer}
                  onSelect={p => onSetOut(transfer.id, p)}
                  options={outOptions}
                  teams={teams}
                />
                <ArrowRight size={14} className="opacity-30 shrink-0" />
                <PlayerPicker
                  label={outPlayer ? "Transfer in..." : "Select out first"}
                  selected={inPlayer}
                  onSelect={p => onSetIn(transfer.id, p)}
                  options={inOptions}
                  teams={teams}
                  disabled={!outPlayer}
                />
                <button
                  onClick={() => onRemove(transfer.id)}
                  className="p-1.5 border border-[#141414]/20 hover:border-rose-500/40 hover:text-rose-500 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>

              {/* Payoff estimator — only shown when this transfer contributes to a hit */}
              {isHittingTransfer && outPlayer && inPlayer && (() => {
                const p = getPayoff(outPlayer, inPlayer, 4);
                return (
                  <div className={`flex items-start gap-2 px-3 py-2 border ${p.border} ${p.bg} ml-1`}>
                    <Clock size={10} className={`mt-0.5 shrink-0 ${p.color}`} />
                    <span className={`font-mono text-[9px] ${p.color}`}>{p.label}</span>
                  </div>
                );
              })()}
            </div>
          );
        })}

        {/* Add transfer button */}
        {derived.transfers.length < maxTransfers && (
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest opacity-40 hover:opacity-100 transition-opacity py-1"
          >
            <Plus size={11} />
            {derived.transfers.length === 0 ? "Plan a transfer" : "Add another transfer"}
          </button>
        )}

        {isHolding && derived.transfers.length === 0 && (
          <div className="font-mono text-[9px] opacity-30 italic">
            No transfers planned — free transfer banks into next gameweek
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface TransferPlannerProps {
  mySquad: any[];
  myTeamInfo: any;
  allPlayers: any[];
  currentGW: number | null;
  teams: any[];
}

export function TransferPlanner({ mySquad, myTeamInfo, allPlayers, currentGW, teams }: TransferPlannerProps) {
  const [horizon, setHorizon] = useState(4);
  const [plans, setPlans] = useState<GWPlan[]>([]);

  const startingFTs = Math.min(2, Math.max(1, myTeamInfo?.transfers_balance ?? 1));
  const startingBank = (myTeamInfo?.last_deadline_bank ?? 0) / 10;

  const LAST_GW = 38;

  // Clamp horizon so we never plan beyond the final gameweek
  const maxHorizon = currentGW ? Math.min(horizon, LAST_GW - currentGW + 1) : horizon;

  // Initialise plans when GW or horizon changes
  useEffect(() => {
    if (!currentGW) return;
    setPlans(
      Array.from({ length: maxHorizon }, (_, i) => ({ gw: currentGW + i, transfers: [] }))
    );
  }, [currentGW, horizon]);

  // Derived plan computation
  const derivedPlans = useMemo<DerivedPlan[]>(() => {
    if (!mySquad.length || !plans.length) return [];
    let squad = [...mySquad];
    let bank = startingBank;
    let nextFTs = startingFTs;

    return plans.map(plan => {
      const ftsAvailable = nextFTs;
      const squadState = [...squad];
      const avgValueBefore = squad.reduce((s, p) => s + (p.valueScore ?? 0), 0) / Math.max(squad.length, 1);

      let newSquad = [...squad];
      let bankDelta = 0;
      const complete = plan.transfers.filter(t => t.outId && t.inId);
      for (const t of complete) {
        const out = newSquad.find(p => p.id === t.outId);
        const inP = allPlayers.find(p => p.id === t.inId);
        if (out && inP) {
          bankDelta += (out.now_cost - inP.now_cost) / 10;
          newSquad = newSquad.map(p => p.id === t.outId ? { ...inP } : p);
        }
      }
      bank += bankDelta;

      const avgValueAfter = newSquad.reduce((s, p) => s + (p.valueScore ?? 0), 0) / Math.max(newSquad.length, 1);
      const hitCost = Math.max(0, complete.length - ftsAvailable) * 4;
      const bankedFT = Math.min(1, Math.max(0, ftsAvailable - complete.length));
      nextFTs = Math.min(2, bankedFT + 1);
      squad = newSquad;

      return { ...plan, ftsAvailable, transfersComplete: complete.length, hitCost, bankAfter: bank, avgValueBefore, avgValueAfter, valueDelta: avgValueAfter - avgValueBefore, squadState, squadAfter: newSquad, bankedFT };
    });
  }, [plans, mySquad, startingFTs, startingBank, allPlayers]);

  // Actions
  const makeId = () => Math.random().toString(36).slice(2);

  const addTransfer = (gwIdx: number) =>
    setPlans(prev => prev.map((p, i) => i === gwIdx ? { ...p, transfers: [...p.transfers, { id: makeId(), outId: null, inId: null }] } : p));

  const removeTransfer = (gwIdx: number, tId: string) =>
    setPlans(prev => prev.map((p, i) => i === gwIdx ? { ...p, transfers: p.transfers.filter(t => t.id !== tId) } : p));

  const setOut = (gwIdx: number, tId: string, player: any | null) =>
    setPlans(prev => prev.map((p, i) => i === gwIdx ? { ...p, transfers: p.transfers.map(t => t.id === tId ? { ...t, outId: player?.id ?? null, inId: null } : t) } : p));

  const setIn = (gwIdx: number, tId: string, player: any | null) =>
    setPlans(prev => prev.map((p, i) => i === gwIdx ? { ...p, transfers: p.transfers.map(t => t.id === tId ? { ...t, inId: player?.id ?? null } : t) } : p));

  const reset = () => {
    if (!currentGW) return;
    setPlans(Array.from({ length: horizon }, (_, i) => ({ gw: currentGW + i, transfers: [] })));
  };

  // Summary totals
  const totalHits = derivedPlans.reduce((s, p) => s + p.hitCost, 0);
  const netValueDelta = derivedPlans.reduce((s, p) => s + p.valueDelta, 0);
  const finalBank = derivedPlans[derivedPlans.length - 1]?.bankAfter ?? startingBank;

  if (!mySquad.length) {
    return (
      <div className="text-center py-16 opacity-30">
        <div className="font-serif italic text-2xl mb-2">Transfer Planner</div>
        <p className="font-mono text-[10px] uppercase tracking-widest">Load your squad in My Squad first</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif italic text-3xl tracking-tighter">Transfer Planner</h2>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] opacity-40 mt-1">
            Map out your transfer strategy {horizon} gameweeks ahead
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] uppercase opacity-40 tracking-widest">Horizon</span>
          {[3, 4, 5].filter(h => !currentGW || currentGW + h - 1 <= LAST_GW).map(h => (
            <button
              key={h}
              onClick={() => setHorizon(h)}
              className={`px-3 py-1.5 font-mono text-[10px] border transition-all ${horizon === h ? "bg-[#141414] text-[#E4E3E0] border-[#141414]" : "border-[#141414]/30 hover:border-[#141414]"}`}
            >
              {h} GWs
            </button>
          ))}
          <button
            onClick={reset}
            className="flex items-center gap-1 px-3 py-1.5 font-mono text-[9px] uppercase border border-[#141414]/20 hover:border-[#141414] transition-all opacity-50 hover:opacity-100"
          >
            <RotateCcw size={10} /> Reset
          </button>
        </div>
      </div>

      {/* Starting context */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Starting FTs", value: `${startingFTs}` },
          { label: "Bank Balance", value: `£${startingBank.toFixed(1)}m` },
          { label: "Avg Value Score", value: (mySquad.reduce((s, p) => s + (p.valueScore ?? 0), 0) / mySquad.length).toFixed(1) },
        ].map(({ label, value }) => (
          <div key={label} className="border border-[#141414]/20 p-3 text-center bg-white/30">
            <div className="font-mono text-lg font-bold">{value}</div>
            <div className="font-mono text-[8px] uppercase opacity-50 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* GW Cards */}
      <div className="space-y-3">
        {derivedPlans.map((derived, gwIdx) => (
          <GWPlanCard
            key={derived.gw}
            derived={derived}
            gwIdx={gwIdx}
            allPlayers={allPlayers}
            teams={teams}
            onAdd={() => addTransfer(gwIdx)}
            onRemove={tId => removeTransfer(gwIdx, tId)}
            onSetOut={(tId, p) => setOut(gwIdx, tId, p)}
            onSetIn={(tId, p) => setIn(gwIdx, tId, p)}
            maxTransfers={2}
          />
        ))}
      </div>

      {/* Summary */}
      <div className="border border-[#141414] p-4 bg-[#141414] text-[#E4E3E0]">
        <div className="font-mono text-[9px] uppercase tracking-widest opacity-50 mb-3">Plan Summary</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className={`font-mono text-xl font-bold ${totalHits > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {totalHits > 0 ? `-${totalHits}` : "0"} pts
            </div>
            <div className="font-mono text-[8px] opacity-40 uppercase mt-1">Total Hit Cost</div>
          </div>
          <div>
            <div className={`font-mono text-xl font-bold ${netValueDelta >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {netValueDelta >= 0 ? "+" : ""}{netValueDelta.toFixed(2)}
            </div>
            <div className="font-mono text-[8px] opacity-40 uppercase mt-1">Net Value Gain</div>
          </div>
          <div>
            <div className="font-mono text-xl font-bold">£{finalBank.toFixed(1)}m</div>
            <div className="font-mono text-[8px] opacity-40 uppercase mt-1">Final Bank</div>
          </div>
        </div>
      </div>
    </div>
  );
}
