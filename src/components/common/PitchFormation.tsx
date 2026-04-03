import { useState, useEffect, useCallback } from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable, useSensor, useSensors, PointerSensor } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Lock } from "lucide-react";
import { getTeamShortName } from "../../utils/team";
import { Team } from "../../types";

const POSITION_COLORS: Record<number, string> = {
  1: "#EAB308",
  2: "#3B82F6",
  3: "#10B981",
  4: "#F43F5E",
};

const VALID_FORMATIONS = ["3-4-3", "3-5-2", "4-3-3", "4-4-2", "4-5-1", "5-3-2", "5-4-1"];

function detectFormation(squad: any[]): string {
  const starters = squad.filter((p) => p.position <= 11);
  const def = starters.filter((p) => p.element_type === 2).length;
  const mid = starters.filter((p) => p.element_type === 3).length;
  const fwd = starters.filter((p) => p.element_type === 4).length;
  const detected = `${def}-${mid}-${fwd}`;
  return VALID_FORMATIONS.includes(detected) ? detected : "4-4-2";
}

function applyFormation(squad: any[], newFormation: string): any[] {
  const [targetDef, targetMid, targetFwd] = newFormation.split("-").map(Number);

  const starters = squad.filter((p) => p.position <= 11);
  const bench = squad.filter((p) => p.position > 11);

  let starterDef = starters.filter((p) => p.element_type === 2);
  let starterMid = starters.filter((p) => p.element_type === 3);
  let starterFwd = starters.filter((p) => p.element_type === 4);
  const starterGK = starters.filter((p) => p.element_type === 1);

  let benchDef = bench.filter((p) => p.element_type === 2);
  let benchMid = bench.filter((p) => p.element_type === 3);
  let benchFwd = bench.filter((p) => p.element_type === 4);
  const benchGK = bench.filter((p) => p.element_type === 1);

  const adjust = (
    starterList: any[],
    benchList: any[],
    target: number
  ): [any[], any[]] => {
    const diff = target - starterList.length;
    if (diff < 0) {
      const toMove = [...starterList]
        .sort((a, b) => a.valueScore - b.valueScore)
        .slice(0, -diff);
      const ids = new Set(toMove.map((p) => p.id));
      return [starterList.filter((p) => !ids.has(p.id)), [...benchList, ...toMove]];
    } else if (diff > 0) {
      const toPromote = [...benchList]
        .sort((a, b) => b.valueScore - a.valueScore)
        .slice(0, diff);
      const ids = new Set(toPromote.map((p) => p.id));
      return [[...starterList, ...toPromote], benchList.filter((p) => !ids.has(p.id))];
    }
    return [starterList, benchList];
  };

  [starterDef, benchDef] = adjust(starterDef, benchDef, targetDef);
  [starterMid, benchMid] = adjust(starterMid, benchMid, targetMid);
  [starterFwd, benchFwd] = adjust(starterFwd, benchFwd, targetFwd);

  const newStarters = [...starterGK, ...starterDef, ...starterMid, ...starterFwd];
  const newBench = [...benchDef, ...benchMid, ...benchFwd, ...benchGK];

  return [
    ...newStarters.map((p, i) => ({ ...p, position: i + 1 })),
    ...newBench.map((p, i) => ({ ...p, position: 12 + i })),
  ];
}

// Compact availability dot instead of large icons
function StatusDot({ player }: { player: any }) {
  if (player.status === "s") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" title="Suspended" />;
  if (player.status === "i" || player.chance_of_playing_next_round === 0)
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 ml-1" title="Injured" />;
  if (player.status === "d" || (player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100))
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 ml-1" title={`${player.chance_of_playing_next_round ?? "?"}%`} />;
  return null;
}

interface PlayerCardProps {
  player: any;
  teams: Team[];
  highlighted: boolean;
  highlightColor: "rose" | "emerald";
  isExcluded: boolean;
  isOnBench: boolean;
  interactive: boolean;
  onPlayerClick?: (id: number) => void;
  rank?: number;
}

function PlayerCard({
  player,
  teams,
  highlighted,
  highlightColor,
  isExcluded,
  isOnBench,
  interactive,
  onPlayerClick,
  rank,
}: PlayerCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: String(player.id), disabled: !interactive });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: String(player.id),
    disabled: !interactive,
  });

  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  const accentColor = POSITION_COLORS[player.element_type];

  const cardBg = highlighted
    ? highlightColor === "rose"
      ? isOnBench
        ? "bg-rose-50 border border-rose-300/50 text-[#141414]"
        : "bg-rose-950/70 text-[#E4E3E0] backdrop-blur-sm"
      : isOnBench
        ? "bg-emerald-50 border border-emerald-300/50 text-[#141414]"
        : "bg-emerald-950/70 text-[#E4E3E0] backdrop-blur-sm"
    : isOnBench
      ? "bg-white border border-[#141414]/20 text-[#141414]"
      : "bg-[#141414]/80 text-[#E4E3E0] backdrop-blur-sm";

  return (
    <div
      ref={setRef}
      style={{
        transform: transform ? CSS.Translate.toString(transform) : undefined,
        borderTopColor: highlighted
          ? (highlightColor === "rose" ? "#f43f5e" : "#10b981")
          : accentColor,
        zIndex: isDragging ? 50 : undefined,
      }}
      {...(interactive ? { ...attributes, ...listeners } : {})}
      onClick={() => onPlayerClick?.(player.id)}
      className={`relative px-2 py-1.5 text-center min-w-[68px] max-w-[86px] border-t-2 select-none transition-shadow
        ${interactive ? "cursor-grab active:cursor-grabbing" : "cursor-default"}
        ${isDragging ? "opacity-40" : ""}
        ${isExcluded ? "opacity-50" : ""}
        ${isOver && !isDragging ? "ring-2 ring-white/50" : ""}
        ${cardBg}
      `}
    >
      {/* Captain / VC badge */}
      {player.is_captain && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-400 text-black text-[8px] font-bold flex items-center justify-center z-10">
          C
        </div>
      )}
      {!player.is_captain && player.is_vice_captain && (
        <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-amber-300/80 text-black text-[8px] font-bold flex items-center justify-center z-10">
          V
        </div>
      )}
      {highlighted && rank !== undefined && (
        <div className={`absolute -bottom-2 -right-2 w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center z-10
          ${highlightColor === "rose" ? "bg-rose-500" : "bg-emerald-500"}`}>
          {rank}
        </div>
      )}
      {isExcluded && (
        <div className="absolute top-0.5 left-0.5">
          <Lock size={7} className={isOnBench ? "text-[#141414]/50" : "text-[#E4E3E0]/50"} />
        </div>
      )}

      <div className={`font-bold text-[11px] leading-tight truncate ${isOnBench ? "text-[#141414]" : "text-[#E4E3E0]"}`}>
        {player.web_name}
        <StatusDot player={player} />
      </div>
      <div className={`font-mono text-[9px] truncate ${isOnBench ? "opacity-50" : "opacity-60 text-[#E4E3E0]"}`}>
        {getTeamShortName(teams, player.team)}
      </div>
      <div className={`font-mono text-[10px] font-bold mt-0.5 ${isOnBench ? "text-[#141414]" : "text-[#E4E3E0]"}`}>
        {player.valueScore}
      </div>
    </div>
  );
}

interface PitchFormationProps {
  squad: any[];
  teams: Team[];
  highlightIds?: Set<number>;
  highlightColor?: "rose" | "emerald";
  highlightRanks?: Map<number, number>;
  onPlayerClick?: (id: number) => void;
  excludedPlayerIds?: Set<number>;
  interactive?: boolean;
}

export function PitchFormation({
  squad,
  teams,
  highlightIds = new Set(),
  highlightColor = "rose",
  highlightRanks = new Map(),
  onPlayerClick,
  excludedPlayerIds = new Set(),
  interactive = true,
}: PitchFormationProps) {
  const [localSquad, setLocalSquad] = useState(squad);
  const [formation, setFormation] = useState(() => detectFormation(squad));

  // Require 8px movement before activating drag — allows clicks to fire normally
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    setLocalSquad(squad);
    setFormation(detectFormation(squad));
  }, [squad]);

  if (!localSquad.length) return null;

  const starters = localSquad.filter((p) => p.position <= 11);
  const bench = localSquad.filter((p) => p.position > 11).sort((a, b) => a.position - b.position);

  const gk = starters.filter((p) => p.element_type === 1);
  const defs = starters.filter((p) => p.element_type === 2).sort((a, b) => a.position - b.position);
  const mids = starters.filter((p) => p.element_type === 3).sort((a, b) => a.position - b.position);
  const fwds = starters.filter((p) => p.element_type === 4).sort((a, b) => a.position - b.position);

  const handleFormationChange = (newFormation: string) => {
    const newSquad = applyFormation(localSquad, newFormation);
    setLocalSquad(newSquad);
    setFormation(newFormation);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedId = Number(active.id);
    const targetId = Number(over.id);
    const dragged = localSquad.find((p) => p.id === draggedId);
    const target = localSquad.find((p) => p.id === targetId);

    if (!dragged || !target) return;
    // GK-only swap rule
    if (dragged.element_type === 1 && target.element_type !== 1) return;
    if (target.element_type === 1 && dragged.element_type !== 1) return;

    const newSquad = localSquad.map((p) => {
      if (p.id === draggedId) return { ...p, position: target.position };
      if (p.id === targetId) return { ...p, position: dragged.position };
      return p;
    });

    setLocalSquad(newSquad);
    setFormation(detectFormation(newSquad));
  };

  const renderRow = (players: any[], isOnBench = false) => (
    <div className={`flex justify-around items-center ${isOnBench ? "gap-2 px-2" : "gap-0.5"}`}>
      {players.map((player) => (
        <PlayerCard
          key={player.id}
          player={player}
          teams={teams}
          highlighted={highlightIds.has(player.id)}
          highlightColor={highlightColor}
          rank={highlightRanks.get(player.id)}
          isExcluded={excludedPlayerIds.has(player.id)}
          isOnBench={isOnBench}
          interactive={interactive}
          onPlayerClick={onPlayerClick}
        />
      ))}
    </div>
  );

  return (
    <div className="max-w-[440px] mx-auto">
      {/* Formation picker */}
      {interactive && (
        <div className="flex justify-center gap-1 mb-4 flex-wrap">
          {VALID_FORMATIONS.map((f) => (
            <button
              key={f}
              onClick={() => handleFormationChange(f)}
              className={`px-2 py-1 font-mono text-[9px] uppercase tracking-wider transition-all
                ${formation === f
                  ? "bg-[#141414] text-[#E4E3E0]"
                  : "border border-[#141414]/20 hover:border-[#141414]/60"
                }`}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {!interactive && (
        <div className="text-center font-mono text-[9px] uppercase opacity-40 tracking-widest mb-2">
          {formation}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* Pitch */}
        <div className="relative bg-emerald-800 w-full h-[520px] rounded overflow-hidden border border-emerald-900">
          {/* Pitch markings */}
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-white/20" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/30" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/5 h-[14%] border border-white/20 border-t-0 rounded-b" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2/5 h-[14%] border border-white/20 border-b-0 rounded-t" />

          {/* Player rows: FWD at top, GK at bottom */}
          <div className="absolute inset-0 flex flex-col justify-around py-2">
            {renderRow(fwds)}
            {renderRow(mids)}
            {renderRow(defs)}
            {renderRow(gk)}
          </div>
        </div>

        {/* Bench */}
        <div className="mt-3 py-3 border border-[#141414]/10 bg-[#141414]/5">
          <div className="font-mono text-[8px] uppercase opacity-40 tracking-widest text-center mb-2">
            Substitutes
          </div>
          {renderRow(bench, true)}
        </div>
      </DndContext>
    </div>
  );
}
