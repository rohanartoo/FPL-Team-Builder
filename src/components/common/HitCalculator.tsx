import { useState } from "react";
import { Calculator, ChevronDown, ChevronUp } from "lucide-react";

/**
 * HitCalculator
 *
 * Answers the most common FPL dilemma: "Is this hit worth taking?"
 *
 * Logic: A hit of N points is worth it only if the incoming player
 * outscores the outgoing player by more than N points total across
 * the planning horizon. The per-GW threshold = hit_size / horizon.
 *
 * Thresholds (empirically calibrated):
 *   ≤ 1.0 pts/GW  → Easy to justify  (green)
 *   1.0–2.0       → Borderline       (amber)
 *   > 2.0         → Hard to justify  (red)
 */

type HitSize = 4 | 8;

function getVerdict(perGW: number): {
  label: string;
  sublabel: string;
  color: string;
  bg: string;
  border: string;
} {
  if (perGW <= 1.0) {
    return {
      label: "Easy to Justify",
      sublabel: "A small, consistent upgrade is all you need.",
      color: "text-emerald-600",
      bg: "bg-emerald-500/5",
      border: "border-emerald-500/30",
    };
  }
  if (perGW <= 2.0) {
    return {
      label: "Borderline",
      sublabel: "Only worth it if the fixtures clearly favour the incoming player.",
      color: "text-amber-600",
      bg: "bg-amber-500/5",
      border: "border-amber-500/30",
    };
  }
  return {
    label: "Hard to Justify",
    sublabel: "You need a dramatically better player — be honest with yourself.",
    color: "text-rose-600",
    bg: "bg-rose-500/5",
    border: "border-rose-500/30",
  };
}

export function HitCalculator() {
  const [isOpen, setIsOpen] = useState(false);
  const [hitSize, setHitSize] = useState<HitSize>(4);
  const [horizon, setHorizon] = useState(3);

  const perGW = hitSize / horizon;
  const verdict = getVerdict(perGW);

  return (
    <div className="border border-[#141414]/20 bg-white/40">
      {/* Header — always visible, click to expand */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#141414]/5 transition-colors group"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest opacity-60 group-hover:opacity-100 transition-opacity">
          <Calculator size={12} />
          Hit Calculator
        </span>
        <span className="opacity-30 group-hover:opacity-60 transition-opacity">
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {isOpen && (
        <div className="px-4 pb-5 space-y-5 border-t border-[#141414]/10">

          {/* Hit Size Toggle */}
          <div className="pt-4">
            <div className="font-mono text-[9px] uppercase opacity-50 tracking-widest mb-2">
              Transfer Hit
            </div>
            <div className="grid grid-cols-2 gap-1">
              {([4, 8] as HitSize[]).map((val) => (
                <button
                  key={val}
                  onClick={() => setHitSize(val)}
                  className={`py-2.5 font-mono text-xs border transition-all ${
                    hitSize === val
                      ? "bg-[#141414] text-[#E4E3E0] border-[#141414]"
                      : "border-[#141414]/20 hover:border-[#141414]/60"
                  }`}
                >
                  -{val} pts
                  <span className="ml-1 opacity-50 text-[9px]">
                    ({val / 4} transfer{val > 4 ? "s" : ""})
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Planning Horizon Slider */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-mono text-[9px] uppercase opacity-50 tracking-widest">
                Planning Horizon
              </span>
              <span className="font-mono text-[10px] font-bold bg-[#141414] text-[#E4E3E0] px-2 py-0.5">
                {horizon} GW{horizon > 1 ? "s" : ""}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={horizon}
              onChange={(e) => setHorizon(Number(e.target.value))}
              className="w-full h-0.5 appearance-none cursor-pointer"
              style={{
                WebkitAppearance: "none",
                background: `linear-gradient(to right, #141414 ${
                  ((horizon - 1) / 5) * 100
                }%, #14141415 ${((horizon - 1) / 5) * 100}%)`,
              }}
            />
            <div className="flex justify-between font-mono text-[8px] opacity-30 mt-2">
              {[1, 2, 3, 4, 5, 6].map((v) => (
                <span key={v}>{v}</span>
              ))}
            </div>
          </div>

          {/* Result Card */}
          <div className={`p-4 border ${verdict.border} ${verdict.bg}`}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className={`font-mono text-3xl font-bold tabular-nums ${verdict.color}`}>
                {perGW.toFixed(2)}
              </span>
              <span className="font-mono text-[10px] opacity-60 uppercase tracking-widest">
                pts/GW required
              </span>
            </div>
            <div className={`font-mono text-[10px] font-bold uppercase tracking-widest mb-1 ${verdict.color}`}>
              {verdict.label}
            </div>
            <div className="font-mono text-[9px] opacity-60 leading-relaxed">
              Your incoming player must outscore their replacement by{" "}
              <span className="font-bold">{perGW.toFixed(2)} pts on average</span> across{" "}
              {horizon} GW{horizon > 1 ? "s" : ""} to recover the -{hitSize} hit.
              {" "}{verdict.sublabel}
            </div>
          </div>

          {/* Breakeven table */}
          <div>
            <div className="font-mono text-[9px] uppercase opacity-40 tracking-widest mb-2">
              Breakeven reference
            </div>
            <div className="grid grid-cols-6 gap-0.5">
              {[1, 2, 3, 4, 5, 6].map((gw) => {
                const ref = hitSize / gw;
                const v = getVerdict(ref);
                const isActive = gw === horizon;
                return (
                  <button
                    key={gw}
                    onClick={() => setHorizon(gw)}
                    className={`p-2 border text-center transition-all ${
                      isActive
                        ? "border-[#141414] bg-[#141414] text-[#E4E3E0]"
                        : `${v.border} ${v.bg} hover:opacity-80`
                    }`}
                  >
                    <div className={`font-mono text-[10px] font-bold ${isActive ? "text-[#E4E3E0]" : v.color}`}>
                      {ref.toFixed(1)}
                    </div>
                    <div className={`font-mono text-[7px] uppercase mt-0.5 ${isActive ? "opacity-60" : "opacity-40"}`}>
                      GW{gw}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="font-mono text-[8px] opacity-30 mt-1.5 italic text-center">
              Click a cell to change the planning horizon
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
