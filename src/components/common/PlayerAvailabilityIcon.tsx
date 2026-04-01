import { Ban, XCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Player } from "../../types";

export const PlayerAvailabilityIcon = ({ player }: { player: Pick<Player, 'status' | 'chance_of_playing_next_round'> }) => {
  if (player.status === 's') return <span title="Suspended" className="inline ml-2"><Ban className="w-4 h-4 text-rose-500 inline" /></span>;
  if (player.status === 'i' || player.chance_of_playing_next_round === 0) return <span title="Injured / Unavailable" className="inline ml-2"><XCircle className="w-4 h-4 text-rose-500 inline" /></span>;
  if (player.status === 'd' || (player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100)) {
    const chance = player.chance_of_playing_next_round !== null ? player.chance_of_playing_next_round : '?';
    return <span title={`Doubtful (${chance}% chance)`} className="inline ml-2"><AlertTriangle className="w-4 h-4 text-yellow-500 inline" /></span>;
  }
  if (player.status === 'u') return <span title="Unavailable" className="inline ml-2"><Ban className="w-4 h-4 text-rose-500 inline" /></span>;
  return <span title="Available" className="inline ml-2"><CheckCircle2 className="w-4 h-4 text-emerald-500/50 inline" /></span>;
};
