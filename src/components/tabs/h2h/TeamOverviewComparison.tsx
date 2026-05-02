import { formatPrice } from "../../../utils/format";

interface TeamOverviewComparisonProps {
  myTeamInfo: any;
  opponentTeamInfo: any;
}

export const TeamOverviewComparison = ({ myTeamInfo, opponentTeamInfo }: TeamOverviewComparisonProps) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-y border-[#141414] py-8">
    <div className="text-center md:text-right md:border-r border-[#141414]/20 pr-0 md:pr-8">
      <div className="font-serif italic text-2xl">{myTeamInfo?.player_first_name} {myTeamInfo?.player_last_name}</div>
      <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{myTeamInfo?.name}</div>
      <div className="mt-6 grid grid-cols-3 gap-4 italic md:not-italic">
        <div>
          <div className="font-mono text-xl font-bold">£{formatPrice(myTeamInfo?.last_deadline_bank ?? 0)}m</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{myTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Rank</div>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{myTeamInfo?.summary_overall_points?.toLocaleString()}</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Total Points</div>
        </div>
      </div>
    </div>

    <div className="text-center md:text-left pl-0 md:pl-8 pt-8 md:pt-0 border-t md:border-t-0 border-[#141414]/10">
      <div className="font-serif italic text-2xl">{opponentTeamInfo?.player_first_name} {opponentTeamInfo?.player_last_name}</div>
      <div className="font-mono text-[10px] opacity-50 uppercase mt-1">{opponentTeamInfo?.name}</div>
      <div className="mt-6 grid grid-cols-3 gap-4 italic md:not-italic">
        <div>
          <div className="font-mono text-xl font-bold">£{formatPrice(opponentTeamInfo?.last_deadline_bank ?? 0)}m</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Bank</div>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{opponentTeamInfo?.summary_overall_rank?.toLocaleString()}</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Rank</div>
        </div>
        <div>
          <div className="font-mono text-xl font-bold">{opponentTeamInfo?.summary_overall_points?.toLocaleString()}</div>
          <div className="font-mono text-[8px] opacity-50 uppercase mt-1">Total Points</div>
        </div>
      </div>
    </div>
  </div>
);
