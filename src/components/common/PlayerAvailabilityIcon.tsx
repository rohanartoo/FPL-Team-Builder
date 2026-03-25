import { Ban, XCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Player } from "../../types";

export const PlayerAvailabilityIcon = ({ player }: { player: Pick<Player, 'status' | 'chance_of_playing_next_round'> }) => {
  if (player.status === 's') return <Ban className="w-4 h-4 text-rose-500 inline ml-2" title="Suspended" />;
  if (player.status === 'i' || player.chance_of_playing_next_round === 0) return <XCircle className="w-4 h-4 text-rose-500 inline ml-2" title="Injured / Unavailable" />;
  if (player.status === 'd' || (player.chance_of_playing_next_round !== null && player.chance_of_playing_next_round < 100)) {
    const chance = player.chance_of_playing_next_round !== null ? player.chance_of_playing_next_round : '?';
    return <AlertTriangle className="w-4 h-4 text-yellow-500 inline ml-2" title={`Doubtful (${chance}% chance)`} />;
  }
  if (player.status === 'u') return <Ban className="w-4 h-4 text-rose-500 inline ml-2" title="Unavailable" />;
  return <CheckCircle2 className="w-4 h-4 text-emerald-500/50 inline ml-2" title="Available" />;
};
