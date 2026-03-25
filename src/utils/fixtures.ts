import { Fixture, Team } from "../types";
import { getTeamShortName } from "./team";

export interface NextFixture {
  opponent: string;
  difficulty: number;
  isHome: boolean;
  event: number;
  isBlank: boolean;
  isDouble?: boolean;
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
      const f = gwFixtures[0];
      const isHome = f.team_h === teamId;
      const opponentId = isHome ? f.team_a : f.team_h;
      const oppContext = isHome ? 'away' : 'home';
      
      let difficulty: number;
      if (playerType !== undefined && tfdrMap[opponentId]?.[oppContext]) {
        difficulty = tfdrMap[opponentId][oppContext][playerType <= 2 ? 'defense_fdr' : 'attack_fdr'];
      } else {
        difficulty = tfdrMap[opponentId]?.[oppContext]?.overall || (isHome ? f.team_h_difficulty : f.team_a_difficulty);
      }

      result.push({
        opponent: gwFixtures.length > 1 ? `${getTeamShortName(teams, opponentId)}+` : getTeamShortName(teams, opponentId),
        difficulty,
        isHome,
        event: gw as number,
        isBlank: false,
        isDouble: gwFixtures.length > 1
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
