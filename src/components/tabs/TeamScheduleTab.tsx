import { ArrowUpRight, ArrowDownRight } from "lucide-react";
import { getFDRColor } from "../../utils/player";

interface TeamScheduleTabProps {
  teamScheduleData: any[];
}

export const TeamScheduleTab = ({ teamScheduleData }: TeamScheduleTabProps) => {
  return (
    <div className="border-t border-[#141414]">
      <div className="grid grid-cols-[1.5fr_0.6fr_1.5fr] md:grid-cols-[2fr_1fr_1fr_1.5fr] p-4 border-b border-[#141414] font-serif italic text-xs opacity-50 uppercase tracking-widest">
        <div>Team</div>
        <div>Avg</div>
        <div className="hidden md:block">Trend</div>
        <div>Fixtures</div>
      </div>
      <div className="divide-y divide-[#141414]">
        {teamScheduleData.map((team) => (
          <div key={team.id} className="grid grid-cols-[1.5fr_0.6fr_1.5fr] md:grid-cols-[2fr_1fr_1fr_1.5fr] p-4 items-center hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors group">
            <div className="font-bold text-base md:text-lg tracking-tight leading-tight">
              <span className="hidden md:inline">{team.name}</span>
              <span className="md:hidden">{team.short_name}</span>
              <div className="md:hidden mt-0.5">
                {team.trend > 0 ? (
                  <span className="flex items-center gap-0.5 text-emerald-500 font-mono text-[9px]"><ArrowUpRight size={10} /> Improving</span>
                ) : team.trend < 0 ? (
                  <span className="flex items-center gap-0.5 text-rose-500 font-mono text-[9px]"><ArrowDownRight size={10} /> Toughening</span>
                ) : (
                  <span className="text-gray-500 font-mono text-[9px]">Stable</span>
                )}
              </div>
            </div>
            <div className="font-mono text-base md:text-lg font-bold">
              {team.next5Avg}
            </div>
            <div className="hidden md:flex items-center gap-2">
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
                  className={`w-8 h-8 md:w-10 md:h-10 flex flex-col items-center justify-center font-mono border
                    ${f.isBlank ? 'bg-[#141414]/10 opacity-40 border-[#141414]/20' : getFDRColor(f.difficulty)}`}
                  title={f.isBlank ? `GW ${f.event}: BLANK` : `${f.opponent} (${f.isHome ? 'H' : 'A'}) - FDR: ${f.difficulty}`}
                >
                  <span className="hidden md:block opacity-50 text-[8px]">GW{f.event}</span>
                  <span className="font-bold text-[9px] md:text-[10px]">{f.isHome ? f.opponent.toUpperCase() : f.opponent.toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
