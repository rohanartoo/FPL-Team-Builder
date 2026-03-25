import { Zap } from "lucide-react";
import { PlayerSummary, Player } from "../../types";
import { PlayerAvailabilityIcon } from "../common/PlayerAvailabilityIcon";

interface ArchetypesTabProps {
  globalPerformanceRoster: any[];
  isFetchingSummaries: boolean;
  playerSummaries: Record<number, PlayerSummary>;
  players: Player[];
}

export const ArchetypesTab = ({
  globalPerformanceRoster,
  isFetchingSummaries,
  playerSummaries,
  players
}: ArchetypesTabProps) => {
  const archetypes = [
    "Game Raiser", 
    "Consistent Performer", 
    "Steady Earner", 
    "Flat Track Bully", 
    "Rotation Risk", 
    "Squad Player", 
    "Low Performer"
  ];

  return (
    <div className="text-[#141414] p-2 min-h-[600px]">
      <div className="mb-8 flex flex-col gap-2 border-b border-[#141414]/10 pb-6">
        <h3 className="font-serif italic text-4xl flex items-center gap-4 text-emerald-600">
          <Zap size={32} /> Performance Archetypes
        </h3>
        <p className="font-mono text-xs opacity-50 tracking-widest uppercase">
          Classifying players based on Points Per 90 gradients across fixture difficulties
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {archetypes.map(arch => (
          <div key={arch} className="border border-[#141414]/10 p-6">
            <h4 className="font-serif italic text-2xl mb-4 border-b border-[#141414]/10 pb-2">{arch}</h4>
            <div className="space-y-3 max-h-72 overflow-y-auto pr-2 custom-scrollbar">
              {globalPerformanceRoster
                .filter(p => p.perfProfile?.archetype === arch)
                .sort((a, b) => b.valueScore - a.valueScore)
                .map(p => (
                  <div key={p.id} className="flex items-center justify-between border-b border-[#141414]/5 pb-2">
                    <div className="font-bold flex items-center">{p.web_name} <PlayerAvailabilityIcon player={p} /></div>
                    <div className="flex gap-4">
                      <span className="font-mono text-xs opacity-50 uppercase tracking-widest items-center flex gap-1">
                        Value <span className="font-bold text-emerald-600">{p.valueScore.toFixed(1)}</span>
                      </span>
                    </div>
                  </div>
                ))}
              {globalPerformanceRoster.filter(p => p.perfProfile?.archetype === arch).length === 0 && (
                <div className="font-mono text-[10px] italic opacity-50">No heavily-trafficked players found in this category.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isFetchingSummaries && playerSummaries && Object.keys(playerSummaries).length < players.length && (
        <div className="mt-8 font-mono text-[10px] opacity-40 text-center uppercase tracking-widest border border-[#141414]/10 p-4 inline-block mx-auto rounded">
          Background server syncing match history... ({Object.keys(playerSummaries).length} / {players.length} players loaded)
        </div>
      )}
    </div>
  );
};
