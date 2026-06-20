import type { GameType } from "@/domain/entities/Game";

export interface RegisterGameDto {
  clubId: string;
  type: GameType;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  sets: { team1Score: number; team2Score: number }[];
  playedAt?: Date;
}

export interface RegisterQuickGameDto {
  clubId: string;
  type: GameType;
  team1PlayerIds: string[];
  team2PlayerIds: string[];
  team1Points: number;
  team2Points: number;
  playedAt?: Date;
}
