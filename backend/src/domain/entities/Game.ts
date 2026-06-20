export type GameType = "SINGLES" | "DOUBLES";

export interface GameSet {
  team1Score: number;
  team2Score: number;
}

export interface GamePlayer {
  id: string;
  email: string | null;
  profile?: { name: string; photo: string | null } | null;
}

export interface Game {
  id: string;
  type: GameType;
  clubId: string;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Players: GamePlayer[];
  team2Players: GamePlayer[];
  sets: GameSet[];
  registeredById: string;
  playedAt: Date;
  createdAt: Date;
}
