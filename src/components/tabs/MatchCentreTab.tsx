import { useParams, useNavigate } from "react-router-dom";
import { MyTeamTab } from "./MyTeamTab";
import { ChipStrategyTab } from "./ChipStrategyTab";
import { H2HMatchupTab } from "./H2HMatchupTab";
import { TransferPlanner } from "./planner/TransferPlanner";
import { Team } from "../../types";

interface MatchCentreTabProps {
  myTeamId: string;
  setMyTeamId: (id: string) => void;
  fetchMyTeam: (id: string) => void;
  myTeamLoading: boolean;
  mySquad: any[];
  setMySquad: (squad: any[]) => void;
  numTransfers: number;
  setNumTransfers: (num: number) => void;
  myTeamError: string | null;
  myTeamInfo: any;
  myTeamHistory: any;
  transferSuggestions: any[];
  expandedTransfers: Record<string, boolean>;
  setExpandedTransfers: any;
  excludedPlayerIds: Set<number>;
  toggleExcludePlayer: (id: number) => void;
  teams: Team[];
  fixtures: any[];
  fplChips: any[];
  currentGW: number | null;
  allPlayers: any[];
  // H2H props
  opponentTeamId: string;
  setOpponentTeamId: (id: string) => void;
  fetchH2H: (myId: string, oppId: string) => void;
  opponentLoading: boolean;
  opponentError: string | null;
  h2hData: any;
  opponentTeamInfo: any;
  opponentTeamHistory: any;
  opponentSquad: any[];
}

type Section = 'squad' | 'chips' | 'h2h' | 'planner';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'squad', label: 'My Squad' },
  { id: 'chips', label: 'Chip Strategy' },
  { id: 'h2h', label: 'H2H Matchup' },
  { id: 'planner', label: 'Transfer Planner' },
];

export const MatchCentreTab = (props: MatchCentreTabProps) => {
  const navigate = useNavigate();
  const { section: rawSection } = useParams<{ section: string }>();
  const activeSection: Section = SECTIONS.some(s => s.id === rawSection)
    ? (rawSection as Section)
    : 'squad';

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-0.5 mb-8">
        {SECTIONS.map(section => (
          <button
            key={section.id}
            onClick={() => navigate(`/my-team/${section.id}`)}
            className={`px-6 py-2 font-mono text-[10px] uppercase tracking-widest transition-all
              ${activeSection === section.id
                ? 'bg-ink text-paper'
                : 'hover:bg-ink/10 opacity-60'}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === 'squad' && (
        <MyTeamTab
          myTeamId={props.myTeamId}
          setMyTeamId={props.setMyTeamId}
          fetchMyTeam={props.fetchMyTeam}
          myTeamLoading={props.myTeamLoading}
          mySquad={props.mySquad}
          numTransfers={props.numTransfers}
          setNumTransfers={props.setNumTransfers}
          myTeamError={props.myTeamError}
          myTeamInfo={props.myTeamInfo}
          myTeamHistory={props.myTeamHistory}
          transferSuggestions={props.transferSuggestions}
          expandedTransfers={props.expandedTransfers}
          setExpandedTransfers={props.setExpandedTransfers}
          excludedPlayerIds={props.excludedPlayerIds}
          toggleExcludePlayer={props.toggleExcludePlayer}
          teams={props.teams}
          fplChips={props.fplChips}
          currentGW={props.currentGW}
          setMySquad={props.setMySquad}
        />
      )}

      {activeSection === 'chips' && (
        <ChipStrategyTab
          mySquad={props.mySquad}
          teams={props.teams}
          fixtures={props.fixtures}
          currentGW={props.currentGW}
          fplChips={props.fplChips}
          myTeamHistory={props.myTeamHistory}
        />
      )}

      {activeSection === 'h2h' && (
        <H2HMatchupTab
          myTeamId={props.myTeamId}
          setMyTeamId={props.setMyTeamId}
          opponentTeamId={props.opponentTeamId}
          setOpponentTeamId={props.setOpponentTeamId}
          fetchH2H={props.fetchH2H}
          myTeamLoading={props.myTeamLoading}
          opponentLoading={props.opponentLoading}
          opponentError={props.opponentError}
          myTeamError={props.myTeamError}
          h2hData={props.h2hData}
          myTeamInfo={props.myTeamInfo}
          opponentTeamInfo={props.opponentTeamInfo}
          myTeamHistory={props.myTeamHistory}
          opponentTeamHistory={props.opponentTeamHistory}
          expandedTransfers={props.expandedTransfers}
          setExpandedTransfers={props.setExpandedTransfers}
          teams={props.teams}
          fplChips={props.fplChips}
          currentGW={props.currentGW}
          mySquad={props.mySquad}
          opponentSquad={props.opponentSquad}
        />
      )}
      {activeSection === 'planner' && (
        <TransferPlanner
          mySquad={props.mySquad}
          myTeamInfo={props.myTeamInfo}
          allPlayers={props.allPlayers}
          currentGW={props.currentGW}
          teams={props.teams}
        />
      )}
    </div>
  );
};
