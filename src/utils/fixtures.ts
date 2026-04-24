import { Fixture, Team } from "../types";
import { getTeamShortName } from "./team";

export interface NextFixture {
  opponent: string;
  difficulty: number;
  isHome: boolean;
  event: number;
  isBlank: boolean;
  isDouble?: boolean;
  opponents?: { name: string; isHome: boolean; difficulty: number }[];
}

export const getNextFixtures = (
  teamId: number,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  count: number = 5,
  offset: number = 0,
  playerType?: number
): NextFixture[] => {
  if (!fixtures.length) return [];

  // Find unique upcoming specified gameweeks (ignoring finished ones and null events like unscheduled games)
  const upcomingEvents = Array.from(new Set(
    fixtures.filter(f => !f.finished && f.event).map(f => f.event)
  )).sort((a: any, b: any) => (a as number) - (b as number));

  const targetEvents = upcomingEvents.slice(offset, offset + count);
  const result: NextFixture[] = [];

  for (const gw of targetEvents) {
    const gwFixtures = fixtures.filter(f => f.event === gw && (f.team_h === teamId || f.team_a === teamId));

    if (gwFixtures.length === 0) {
      result.push({
        opponent: "BLA",
        difficulty: 5, // Blank is max difficulty (no points possible)
        isHome: false,
        event: gw as number,
        isBlank: true
      });
    } else {
      const isDouble = gwFixtures.length > 1;

      // Build per-fixture details for all games in this GW
      const opponents = gwFixtures.map(f => {
        const home = f.team_h === teamId;
        const oppId = home ? f.team_a : f.team_h;
        const ctx = home ? 'away' : 'home';
        let diff: number;
        if (playerType !== undefined && tfdrMap[oppId]?.[ctx]) {
          diff = tfdrMap[oppId][ctx][playerType <= 2 ? 'defense_fdr' : 'attack_fdr'];
        } else {
          diff = tfdrMap[oppId]?.[ctx]?.overall || (home ? f.team_h_difficulty : f.team_a_difficulty);
        }
        return { name: getTeamShortName(teams, oppId), isHome: home, difficulty: diff };
      });

      // Primary fixture (first) drives the legacy fields; DGW uses the easier difficulty for colour
      const primary = opponents[0];
      const difficulty = isDouble
        ? Math.min(...opponents.map(o => o.difficulty))
        : primary.difficulty;

      result.push({
        opponent: isDouble ? `${primary.name}+` : primary.name,
        difficulty,
        isHome: primary.isHome,
        event: gw as number,
        isBlank: false,
        isDouble,
        opponents,
      });
    }
  }

  return result;
};

export const calculateAvgDifficulty = (
  teamId: number,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  count: number = 5,
  offset: number = 0,
  playerType?: number
): number => {
  const upcoming = getNextFixtures(teamId, fixtures, teams, tfdrMap, count, offset, playerType);
  if (upcoming.length === 0) return 0;
  return parseFloat((upcoming.reduce((sum, f) => sum + f.difficulty, 0) / upcoming.length).toFixed(2));
};

export const calculateFDR = (
  teamId: number,
  fixtures: Fixture[],
  teams: Team[],
  tfdrMap: Record<number, any>,
  playerType: number
): number => {
  return calculateAvgDifficulty(teamId, fixtures, teams, tfdrMap, 5, 0, playerType);
};
