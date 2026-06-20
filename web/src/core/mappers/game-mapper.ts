import type { Game } from "@/core/domain/game";
import type { GameView } from "@/core/views/game.view";

export class GameMapper {
  static toDomain(view: GameView): Game {
    return {
      id: view.id,
      type: view.type,
      clubId: view.clubId,
      team1PlayerIds: view.team1PlayerIds,
      team2PlayerIds: view.team2PlayerIds,
      team1Players: view.team1Players || [],
      team2Players: view.team2Players || [],
      sets: view.sets,
      registeredById: view.registeredById,
      playedAt: view.playedAt,
      createdAt: view.createdAt,
      winner: view.winner,
      team1SetsWon: view.team1SetsWon,
      team2SetsWon: view.team2SetsWon,
      isQuickMode: view.isQuickMode,
      setsSummary: view.setsSummary,
      resultSummary: view.resultSummary,
    };
  }
}
