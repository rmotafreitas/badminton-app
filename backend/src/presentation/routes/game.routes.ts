import Elysia, { t } from "elysia";
import type { GameController } from "@/presentation/controllers/GameController";
import { requireRoles } from "@/presentation/middleware/auth.guard";
import type { JwtService } from "@/application/jwt/JwtService";

export const gameRoutes = (ctrl: GameController, jwtService: JwtService) =>
  new Elysia({ prefix: "/games" })
    .derive(
      requireRoles(jwtService, "PLAYER", "COACH", "CLUB_ADMIN", "SYSTEM_ADMIN"),
    )

    .post(
      "/",
      ({ currentUser, body }) => ctrl.registerGame(currentUser, body),
      {
        body: t.Object({
          clubId: t.String(),
          type: t.Union([t.Literal("SINGLES"), t.Literal("DOUBLES")]),
          team1PlayerIds: t.Array(t.String()),
          team2PlayerIds: t.Array(t.String()),
          sets: t.Array(
            t.Object({
              team1Score: t.Number(),
              team2Score: t.Number(),
            }),
          ),
          playedAt: t.Optional(t.Date()),
        }),
        detail: { tags: ["Games"], summary: "Register a new game result" },
      },
    )

    .post(
      "/quick",
      ({ currentUser, body }) => ctrl.registerQuickGame(currentUser, body),
      {
        body: t.Object({
          clubId: t.String(),
          type: t.Union([t.Literal("SINGLES"), t.Literal("DOUBLES")]),
          team1PlayerIds: t.Array(t.String()),
          team2PlayerIds: t.Array(t.String()),
          team1Points: t.Number(),
          team2Points: t.Number(),
          playedAt: t.Optional(t.Date()),
        }),
        detail: {
          tags: ["Games"],
          summary: "Quick register a game (point-based, single set)",
        },
      },
    )

    .get(
      "/club/:clubId",
      ({ params }) => ctrl.getRecentGamesByClub(params.clubId),
      {
        detail: { tags: ["Games"], summary: "Get recent games for a club" },
      },
    )

    .get(
      "/me",
      ({ currentUser }) => ctrl.getMyGames(currentUser),
      {
        detail: { tags: ["Games"], summary: "Get all games for the current user" },
      },
    )

    .get(
      "/:gameId",
      ({ params }) => ctrl.getGameById(params.gameId),
      {
        detail: { tags: ["Games"], summary: "Get a single game by ID" },
      },
    )

    .delete(
      "/:gameId",
      ({ currentUser, params }) => ctrl.deleteGame(currentUser, params.gameId),
      {
        detail: { tags: ["Games"], summary: "Delete a game" },
      },
    )

    .put(
      "/:gameId",
      ({ currentUser, params, body }) => ctrl.updateGame(currentUser, params.gameId, body),
      {
        body: t.Object({
          type: t.Optional(t.Union([t.Literal("SINGLES"), t.Literal("DOUBLES")])),
          team1PlayerIds: t.Optional(t.Array(t.String())),
          team2PlayerIds: t.Optional(t.Array(t.String())),
          sets: t.Optional(
            t.Array(t.Object({ team1Score: t.Number(), team2Score: t.Number() })),
          ),
          playedAt: t.Optional(t.Date()),
        }),
        detail: { tags: ["Games"], summary: "Update a game" },
      },
    );
