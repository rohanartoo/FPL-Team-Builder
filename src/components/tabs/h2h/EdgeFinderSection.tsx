import { TrendingUp, ArrowDownRight, ArrowUpRight, ChevronRight, ChevronDown } from "lucide-react";
import { getTeamShortName } from "../../../utils/team";
import { formatPrice } from "../../../utils/format";
import { PlayerAvailabilityIcon } from "../../common/PlayerAvailabilityIcon";
import { Team } from "../../../types";

interface EdgeFinderSectionProps {
  suggestions: any[];
  teams: Team[];
  expandedTransfers: Record<string, boolean>;
  setExpandedTransfers: (updater: (prev: any) => any) => void;
}

export const EdgeFinderSection = ({ suggestions, teams, expandedTransfers, setExpandedTransfers }: EdgeFinderSectionProps) => (
  <div>
    <h3 className="font-serif italic text-2xl mb-8 flex items-center gap-3">
      <TrendingUp className="w-6 h-6" /> Edge Finder
    </h3>
    <p className="font-mono text-xs opacity-60 mb-6">
      Replacing your weakest differentials with these options (within your budget) gives you the highest statistical edge against their unique players in this matchup.
    </p>

    <div className="space-y-6">
      {suggestions.map((suggestion: any, i: number) => (
        <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1.5fr] gap-8 items-center bg-white/50 p-6 border border-[#141414]/10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-rose-500/10 text-rose-500 rounded-full">
              <ArrowDownRight size={20} />
            </div>
            <div>
              <div className="font-bold text-lg flex items-center">{suggestion.out.web_name} <PlayerAvailabilityIcon player={suggestion.out} /></div>
              <div className="font-mono text-[10px] opacity-50 uppercase">
                {getTeamShortName(teams, suggestion.out.team)} • £{formatPrice(suggestion.out.now_cost)}m
              </div>
              <div className="mt-2 font-mono text-[10px] text-rose-500">
                VALUE SCORE: {suggestion.out.valueScore}
              </div>
            </div>
          </div>

          <div className="flex md:block justify-center py-2 md:py-0 text-[#141414]/20 scale-75 md:scale-100">
            <ChevronRight size={32} className="hidden md:block" />
            <ChevronDown size={32} className="md:hidden" />
          </div>

          <div className="space-y-3">
            {suggestion.options.length === 0 ? (
              <div className="font-mono text-[10px] opacity-50 italic">No better options found within budget for this position.</div>
            ) : (
              <>
                {(expandedTransfers[suggestion.out.id] ? suggestion.options : suggestion.options.slice(0, 3)).map((opt: any, j: number) => (
                  <div key={j} className="flex items-center justify-between bg-white p-3 border border-emerald-500/30 shadow-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-emerald-500/5 translate-y-full group-hover:translate-y-0 transition-transform" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="text-emerald-500">
                        <ArrowUpRight size={16} />
                      </div>
                      <div>
                        <div className="font-bold text-sm flex items-center">{opt.web_name} <PlayerAvailabilityIcon player={opt} /></div>
                        <div className="font-mono text-[10px] opacity-50 uppercase">
                          {getTeamShortName(teams, opt.team)} • £{formatPrice(opt.now_cost)}m
                        </div>
                      </div>
                    </div>
                    <div className="text-right relative z-10">
                      <div className="font-mono text-sm font-bold text-emerald-500">+{(opt.valueScore - suggestion.out.valueScore).toFixed(1)}</div>
                      <div className="font-mono text-[10px] opacity-50 uppercase">Edge Gained</div>
                    </div>
                  </div>
                ))}
                {suggestion.options.length > 3 && (
                  <button
                    onClick={() => setExpandedTransfers((prev: any) => ({ ...prev, [suggestion.out.id]: !prev[suggestion.out.id] }))}
                    className="w-full py-2 font-mono text-[10px] uppercase tracking-widest border border-emerald-500/30 bg-white/50 hover:bg-emerald-500/10 transition-colors mt-2"
                  >
                    {expandedTransfers[suggestion.out.id] ? "Show Less" : "Show More Edge Players"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);
