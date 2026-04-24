import { useState } from "react";
import { MyTeamTab } from "./MyTeamTab";
import { ChipStrategyTab } from "./ChipStrategyTab";
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
}

type Section = 'mysquad' | 'chips';

export const MatchCentreTab = (props: MatchCentreTabProps) => {
  const [activeSection, setActiveSection] = useState<Section>('mysquad');

  const sections: { id: Section; label: string }[] = [
    { id: 'mysquad', label: 'My Squad' },
    { id: 'chips', label: 'Chip Strategy' },
  ];

  return (
    <div>
      <div className="flex justify-center gap-0.5 mb-8">
        {sections.map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`px-6 py-2 font-mono text-[10px] uppercase tracking-widest transition-all
              ${activeSection === section.id
                ? 'bg-[#141414] text-[#E4E3E0]'
                : 'hover:bg-[#141414]/10 opacity-60'}`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === 'mysquad' && (
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
    </div>
  );
};
