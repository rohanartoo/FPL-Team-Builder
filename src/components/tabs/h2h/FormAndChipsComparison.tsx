import { getChipLabel } from "../../../utils/format";

interface ChipsSideProps {
  teamHistory: any;
  fplChips: any[];
  currentGW: number | null;
  align: "left" | "right";
}

const ChipsSide = ({ teamHistory, fplChips, currentGW, align }: ChipsSideProps) => {
  const isRight = align === "right";
  const justify = isRight ? "md:justify-end" : "md:justify-start";
  const textAlign = isRight ? "text-center md:text-right" : "text-center md:text-left";

  const availableChips = fplChips.filter(def => {
    const isPlayed = teamHistory.chips.some((played: any) =>
      played.name === def.name &&
      played.event >= def.start_event &&
      played.event <= def.stop_event
    );
    if (isPlayed) return false;
    if (currentGW && currentGW > def.stop_event) return false;
    return true;
  });

  return (
    <div className={isRight ? "md:border-r border-[#141414]/20 pr-0 md:pr-8" : "pl-0 md:pl-8 pt-8 md:pt-0 border-t md:border-t-0 border-[#141414]/10 text-center md:text-left"}>
      <div className="mb-6">
        <div className={`font-mono text-[10px] uppercase opacity-60 mb-3 tracking-widest ${textAlign}`}>Last 5 GWs Points</div>
        <div className={`flex justify-center ${justify} gap-2`}>
          {teamHistory.current.slice(-5).map((gw: any, i: number) => (
            <div key={i} className="flex flex-col items-center border border-[#141414] w-10 py-1 bg-[#141414] text-[#E4E3E0]">
              <span className="text-[8px] opacity-60">GW{gw.event}</span>
              <span className="font-bold text-sm">{gw.points}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mb-4">
        <div className={`font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest ${textAlign}`}>Chips Played</div>
        <div className={`flex justify-center ${justify} gap-2 flex-wrap`}>
          {teamHistory.chips.length === 0 ? (
            <span className="font-mono text-[10px] italic opacity-50">None</span>
          ) : (
            teamHistory.chips.map((chip: any, i: number) => (
              <div key={i} className="px-2 py-1 border border-rose-500/30 bg-rose-500/10 text-rose-600 font-mono text-[8px] uppercase tracking-wider">
                {getChipLabel(chip.name)} (GW{chip.event})
              </div>
            ))
          )}
        </div>
      </div>
      <div>
        <div className={`font-mono text-[10px] uppercase opacity-60 mb-2 tracking-widest ${textAlign}`}>Chips Available</div>
        <div className={`flex justify-center ${justify} gap-2 flex-wrap`}>
          {availableChips.length === 0 ? (
            <span className="font-mono text-[10px] italic opacity-50">None</span>
          ) : (
            availableChips.map((c, i) => (
              <div key={i} className="px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 font-mono text-[8px] uppercase tracking-wider">
                {getChipLabel(c.name)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface FormAndChipsComparisonProps {
  myTeamHistory: any;
  opponentTeamHistory: any;
  fplChips: any[];
  currentGW: number | null;
}

export const FormAndChipsComparison = ({ myTeamHistory, opponentTeamHistory, fplChips, currentGW }: FormAndChipsComparisonProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y border-[#141414] py-8">
    <ChipsSide teamHistory={myTeamHistory} fplChips={fplChips} currentGW={currentGW} align="right" />
    <ChipsSide teamHistory={opponentTeamHistory} fplChips={fplChips} currentGW={currentGW} align="left" />
  </div>
);
