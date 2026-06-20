import type { Game, GameType } from "@/domain/entities/Game";
import type { GameView } from "@/application/views/game.view";

export class GameMapper {
  static toDomain(record: any): Game {
    return {
      id: record.id,
      type: record.type as GameType,
      clubId: record.clubId,
      team1PlayerIds: record.team1PlayerIds,
      team2PlayerIds: record.team2PlayerIds,
      team1Players: record.team1Players || [],
      team2Players: record.team2Players || [],
      sets: record.sets,
      registeredById: record.registeredById,
      playedAt: record.playedAt,
      createdAt: record.createdAt,
    };
  }

  static toView(game: Game): GameView {
    const sets = game.sets || [];
    let team1Wins = 0;
    let team2Wins = 0;

    for (const s of sets) {
      if (s.team1Score > s.team2Score) team1Wins++;
      else if (s.team2Score > s.team1Score) team2Wins++;
    }

    const isQuickMode = sets.length <= 1;
    const winner =
      team1Wins > team2Wins ? "team1" : team2Wins > team1Wins ? "team2" : null;
    const setsSummary = sets.map((s) => `${s.team1Score}-${s.team2Score}`).join(", ");
    const resultSummary = isQuickMode
      ? setsSummary
      : `${team1Wins}-${team2Wins}`;

    return {
      id: game.id,
      type: game.type,
      clubId: game.clubId,
      team1PlayerIds: game.team1PlayerIds,
      team2PlayerIds: game.team2PlayerIds,
      team1Players: game.team1Players,
      team2Players: game.team2Players,
      sets: game.sets,
      registeredById: game.registeredById,
      playedAt: game.playedAt,
      createdAt: game.createdAt,
      winner,
      team1SetsWon: team1Wins,
      team2SetsWon: team2Wins,
      isQuickMode,
      setsSummary,
      resultSummary,
    };
  }
}
