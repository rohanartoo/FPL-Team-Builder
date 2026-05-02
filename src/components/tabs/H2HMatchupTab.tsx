import { PitchFormation } from "../common/PitchFormation";
import { Team } from "../../types";
import { TeamOverviewComparison } from "./h2h/TeamOverviewComparison";
import { FormAndChipsComparison } from "./h2h/FormAndChipsComparison";
import { MatchupBreakdown } from "./h2h/MatchupBreakdown";
import { EdgeFinderSection } from "./h2h/EdgeFinderSection";

interface H2HMatchupTabProps {
  myTeamId: string;
  setMyTeamId: (id: string) => void;
  opponentTeamId: string;
  setOpponentTeamId: (id: string) => void;
  fetchH2H: (myId: string, oppId: string) => void;
  myTeamLoading: boolean;
  opponentLoading: boolean;
  myTeamError: string | null;
  opponentError: string | null;
  h2hData: any;
  myTeamInfo: any;
  opponentTeamInfo: any;
  myTeamHistory: any;
  opponentTeamHistory: any;
  expandedTransfers: Record<string, boolean>;
  setExpandedTransfers: any;
  teams: Team[];
  fplChips: any[];
  currentGW: number | null;
  mySquad: any[];
  opponentSquad: any[];
}

export const H2HMatchupTab = ({
  myTeamId,
  setMyTeamId,
  opponentTeamId,
  setOpponentTeamId,
  fetchH2H,
  myTeamLoading,
  opponentLoading,
  myTeamError,
  opponentError,
  h2hData,
  myTeamInfo,
  opponentTeamInfo,
  myTeamHistory,
  opponentTeamHistory,
  expandedTransfers,
  setExpandedTransfers,
  teams,
  fplChips,
  currentGW,
  mySquad,
  opponentSquad,
}: H2HMatchupTabProps) => (
  <div className="p-4 md:p-8 max-w-6xl mx-auto">
    <div className="mb-12 text-center">
      <h2 className="font-serif italic text-4xl mb-4">H2H Matchup</h2>
      <p className="font-mono text-xs opacity-50 uppercase tracking-widest">
        Compare your team against an opponent to find transfer edges
      </p>

      <div className="mt-8 flex flex-col md:flex-row items-center justify-center gap-6">
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <label className="font-mono text-[10px] uppercase opacity-60 text-left">My Team ID</label>
          <input
            type="text"
            value={myTeamId}
            onChange={(e) => setMyTeamId(e.target.value)}
            placeholder="e.g. 123456"
            className="bg-transparent border border-[#141414] px-4 py-2 font-mono text-sm focus:outline-none w-full"
          />
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <label className="font-mono text-[10px] uppercase opacity-60 text-left">Opponent Team ID</label>
          <input
            type="text"
            value={opponentTeamId}
            onChange={(e) => setOpponentTeamId(e.target.value)}
            placeholder="e.g. 654321"
            className="bg-transparent border border-[#141414] px-4 py-2 font-mono text-sm focus:outline-none w-full"
          />
        </div>
      </div>

      <div className="mt-6">
        <button
          onClick={() => fetchH2H(myTeamId, opponentTeamId)}
          disabled={myTeamLoading || opponentLoading || !myTeamId || !opponentTeamId}
          className="bg-[#141414] text-[#E4E3E0] px-8 py-3 font-mono text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {myTeamLoading || opponentLoading ? "Syncing Matchup..." : "Analyze Matchup"}
        </button>
      </div>

      {myTeamError && (
        <p className="mt-4 text-rose-500 font-mono text-[10px] uppercase">{myTeamError}</p>
      )}
      {opponentError && (
        <p className="mt-4 text-rose-500 font-mono text-[10px] uppercase">{opponentError}</p>
      )}
    </div>

    {h2hData && (
      <div className="space-y-16">
        <TeamOverviewComparison myTeamInfo={myTeamInfo} opponentTeamInfo={opponentTeamInfo} />

        {myTeamHistory && opponentTeamHistory && (
          <FormAndChipsComparison
            myTeamHistory={myTeamHistory}
            opponentTeamHistory={opponentTeamHistory}
            fplChips={fplChips}
            currentGW={currentGW}
          />
        )}

        {mySquad.length > 0 && opponentSquad.length > 0 && (
          <div>
            <h3 className="font-serif italic text-2xl mb-6 text-center">Formations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="font-mono text-[9px] uppercase opacity-50 tracking-widest text-center mb-3">
                  {myTeamInfo?.name}
                </div>
                <PitchFormation
                  squad={mySquad}
                  teams={teams}
                  highlightIds={new Set((h2hData?.myDiff ?? []).map((p: any) => p.id))}
                  highlightColor="emerald"
                  interactive={false}
                />
              </div>
              <div>
                <div className="font-mono text-[9px] uppercase opacity-50 tracking-widest text-center mb-3">
                  {opponentTeamInfo?.name}
                </div>
                <PitchFormation
                  squad={opponentSquad}
                  teams={teams}
                  highlightIds={new Set((h2hData?.oppDiff ?? []).map((p: any) => p.id))}
                  highlightColor="rose"
                  interactive={false}
                />
              </div>
            </div>
          </div>
        )}

        <MatchupBreakdown h2hData={h2hData} teams={teams} />

        {h2hData.suggestions.length > 0 && (
          <EdgeFinderSection
            suggestions={h2hData.suggestions}
            teams={teams}
            expandedTransfers={expandedTransfers}
            setExpandedTransfers={setExpandedTransfers}
          />
        )}
      </div>
    )}
  </div>
);
