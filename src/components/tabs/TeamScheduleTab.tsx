import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { getFDRColor } from "../../utils/player";

interface TeamScheduleTabProps {
  teamScheduleData: any[];
}

export const TeamScheduleTab = ({ teamScheduleData }: TeamScheduleTabProps) => {
  return (
    <div className="border-t border-[#141414] overflow-x-auto scrollbar-hide">
      <div className="grid grid-cols-[2fr_1fr_1fr_1.5fr] min-w-[900px] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest">
        <div>Team</div>
        <div>Next 5 Avg</div>
        <div>Trend</div>
        <div>Next 5 Fixtures</div>
      </div>
      <div className="divide-y divide-[#141414]">
        {teamScheduleData.map((team) => (
          <div key={team.id} className="grid grid-cols-[2fr_1fr_1fr_1.5fr] min-w-[900px] p-4 items-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
            <div className="font-bold text-lg tracking-tight">{team.name}</div>
            <div className="font-mono text-lg font-bold">
              {team.next5Avg}
            </div>
            <div className="flex items-center gap-2">
              {team.trend > 0 ? (
                <div className="flex items-center gap-1 text-emerald-500 font-mono text-[10px]">
                  <ArrowUpRight size={12} /> IMPROVING
                </div>
              ) : team.trend < 0 ? (
                <div className="flex items-center gap-1 text-rose-500 font-mono text-[10px]">
                  <ArrowDownRight size={12} /> TOUGHENING
                </div>
              ) : (
                <div className="text-gray-500 font-mono text-[10px]">STABLE</div>
              )}
            </div>
            <div className="flex gap-1">
              {team.fixtures.map((f: any, i: number) => (
                <div
                  key={i}
                  className={`w-10 h-10 flex flex-col items-center justify-center font-mono text-[10px] border
                    ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20' : getFDRColor(f.difficulty)}`}
                >
                  <span className="opacity-50 text-[8px]">GW{f.event}</span>
                  <span className="font-bold">{f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
