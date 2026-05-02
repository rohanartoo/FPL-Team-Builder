import React, { useMemo } from "react";
import { Team, Fixture, POSITION_MAP } from "../../../types";
import { getTeamShortName } from "../../../utils/team";
import { computePositionThresholds } from "../../../utils/playerThresholds";
import { getPlayerFlags } from "../../../utils/playerSignals";

interface ComparePlayerHeaderProps {
  playerA: any;
  playerB: any;
  teams: Team[];
  fixtures: Fixture[];
  tfdrMap: Record<number, any>;
  currentGW: number;
  processedPlayers: any[];
}

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

const renderFlags = (player: any, fixtures: Fixture[], teams: Team[], tfdrMap: Record<number, any>, positionThresholds: any, currentGW: number) => {
  const { isFTBRun, isHiddenGem, isFormRun, isPriceRise, isBookingRisk, isDueAGoal, isRegressionRisk } = getPlayerFlags(player, fixtures, teams, tfdrMap, positionThresholds, currentGW);
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

export const ComparePlayerHeader = ({
  playerA,
  playerB,
  teams,
  fixtures,
  tfdrMap,
  currentGW,
  processedPlayers,
}: ComparePlayerHeaderProps) => {
  const positionThresholds = useMemo(() => computePositionThresholds(processedPlayers), [processedPlayers]);

  return (
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
        <div className="flex justify-end">{renderFlags(playerA, fixtures, teams, tfdrMap, positionThresholds, currentGW)}</div>
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
        {renderFlags(playerB, fixtures, teams, tfdrMap, positionThresholds, currentGW)}
      </div>
    </div>
  );
};
