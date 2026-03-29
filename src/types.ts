export interface Team {
  id: number;
  name: string;
  short_name: string;
  strength: number;
}

export interface Player {
  id: number;
  first_name: string;
  second_name: string;
  web_name: string;
  team: number;
  element_type: number; // 1: GKP, 2: DEF, 3: MID, 4: FWD
  now_cost: number;
  total_points: number;
  form: string;
  points_per_game: string;
  selected_by_percent: string;
  status: string;
  chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null;
  news: string;
  yellow_cards: number;
  red_cards: number;
  minutes: number;
}

export interface Fixture {
  id: number;
  event: number;
  finished: boolean;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  team_h_expected_goals?: string;
  team_a_expected_goals?: string;
}

export interface PlayerSummary {
  history: Array<{
    element: number;
    fixture: number;
    opponent_team: number;
    total_points: number;
    was_home: boolean;
    kickoff_time: string;
    minutes: number;
    goals_scored: number;
    assists: number;
    clean_sheets: number;
    bonus: number;
  }>;
  fixtures: Array<{
    id: number;
    event: number;
    team_h: number;
    team_a: number;
    difficulty: number;
    is_home: boolean;
  }>;
}

export const POSITION_MAP: Record<number, string> = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD",
};
