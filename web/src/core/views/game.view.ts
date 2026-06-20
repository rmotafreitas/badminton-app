import type { GameType, GameSet, GamePlayer } from "@/core/domain/game";

export interface GameView {
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
  winner: "team1" | "team2" | null;
  team1SetsWon: number;
  team2SetsWon: number;
  isQuickMode: boolean;
  setsSummary: string;
  resultSummary: string;
}
