import { Fixture, Team } from "../../types";
import { FixtureHeatmap } from "../shared/FixtureHeatmap";

interface TeamScheduleTabProps {
  fixtures: Fixture[];
  teams: Team[];
  tfdrMap: Record<number, any>;
  onTeamClick?: (teamId: number) => void;
}

export const TeamScheduleTab = ({ fixtures, teams, tfdrMap, onTeamClick }: TeamScheduleTabProps) => {
  return (
    <div className="bg-white/5 border border-[#141414] p-4 md:p-8 min-h-[600px]">
      <FixtureHeatmap fixtures={fixtures} teams={teams} tfdrMap={tfdrMap} onTeamClick={onTeamClick} />
    </div>
  );
};
