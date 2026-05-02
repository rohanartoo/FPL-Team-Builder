import React from "react";
import { Team, Fixture } from "../../../types";
import { getNextFixtures } from "../../../utils/fixtures";
import { getFDRColor } from "../../../utils/player";

interface FixturesComparisonProps {
  playerA: any;
  playerB: any;
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
}

export const FixturesComparison = ({
  playerA,
  playerB,
  fixtures,
  teams,
  tfdrMap,
}: FixturesComparisonProps) => {
  const upcomingA = getNextFixtures(playerA.team, fixtures, teams, tfdrMap, 5, 0, playerA.element_type);
  const upcomingB = getNextFixtures(playerB.team, fixtures, teams, tfdrMap, 5, 0, playerB.element_type);

  return (
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
  );
};
