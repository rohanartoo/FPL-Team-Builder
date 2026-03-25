import { Team } from "../types";

export const getTeamName = (teams: Team[], id: number) => 
  teams.find(t => t.id === id)?.name || "Unknown";

export const getTeamShortName = (teams: Team[], id: number) => 
  teams.find(t => t.id === id)?.short_name || "UNK";
