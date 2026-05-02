import { Swords } from "lucide-react";
import { getTeamShortName } from "../../../utils/team";
import { PlayerAvailabilityIcon } from "../../common/PlayerAvailabilityIcon";
import { Team } from "../../../types";

interface MatchupBreakdownProps {
  h2hData: any;
  teams: Team[];
}

export const MatchupBreakdown = ({ h2hData, teams }: MatchupBreakdownProps) => (
  <div>
    <h3 className="font-serif italic text-2xl mb-8 text-center flex items-center justify-center gap-3">
      <Swords className="w-6 h-6" /> Matchup Breakdown
    </h3>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="border border-[#141414]/10 bg-emerald-500/5">
        <div className="bg-[#141414] text-[#E4E3E0] p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
          <span>My Differentials</span>
          <span className="opacity-60">{h2hData.myDiff.length}</span>
        </div>
        <div className="divide-y divide-[#141414]/10">
          {h2hData.myDiff.map((p: any, i: number) => (
            <div key={i} className="p-3 flex justify-between items-center bg-white/50">
              <div>
                <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-emerald-600">{p.valueScore}</div>
                <div className="text-[8px] opacity-50 uppercase">Value</div>
              </div>
            </div>
          ))}
          {h2hData.myDiff.length === 0 && (
            <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No unique players</div>
          )}
        </div>
      </div>

      <div className="border border-[#141414]/10 bg-white/30">
        <div className="border-b border-[#141414]/10 p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
          <span>Common Players</span>
          <span className="opacity-60">{h2hData.common.length}</span>
        </div>
        <div className="divide-y divide-[#141414]/10">
          {h2hData.common.map((p: any, i: number) => (
            <div key={i} className="p-3 flex justify-between items-center">
              <div>
                <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold">{p.valueScore}</div>
                <div className="text-[8px] opacity-50 uppercase">Value</div>
              </div>
            </div>
          ))}
          {h2hData.common.length === 0 && (
            <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No common players</div>
          )}
        </div>
      </div>

      <div className="border border-[#141414]/10 bg-rose-500/5">
        <div className="bg-[#141414] text-[#E4E3E0] p-3 text-center font-mono text-xs uppercase tracking-widest flex justify-between">
          <span>Opponent Differentials</span>
          <span className="opacity-60">{h2hData.oppDiff.length}</span>
        </div>
        <div className="divide-y divide-[#141414]/10">
          {h2hData.oppDiff.map((p: any, i: number) => (
            <div key={i} className="p-3 flex justify-between items-center bg-white/50">
              <div>
                <div className="font-bold text-sm flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                <div className="text-[10px] opacity-50 uppercase">{getTeamShortName(teams, p.team)}</div>
              </div>
              <div className="text-right">
                <div className="font-mono font-bold text-rose-600">{p.valueScore}</div>
                <div className="text-[8px] opacity-50 uppercase">Value</div>
              </div>
            </div>
          ))}
          {h2hData.oppDiff.length === 0 && (
            <div className="p-6 text-center font-mono text-[10px] opacity-50 italic">No unique players</div>
          )}
        </div>
      </div>
    </div>
  </div>
);
