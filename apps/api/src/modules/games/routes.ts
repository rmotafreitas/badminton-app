import {
  ErrorResponseSchema,
  GameListSchema,
  GameSchema,
  IdParamsSchema,
  IdSchema,
  RatingHistorySchema,
  RegisterGameBodySchema,
  UpdateGameBodySchema,
} from "@bb/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "@/http";
import type { ApiDeps } from "@/modules/deps";
import { presentGame } from "@/modules/presenters";

const errors = { 401: ErrorResponseSchema, 403: ErrorResponseSchema, 404: ErrorResponseSchema, 422: ErrorResponseSchema };
const list = { 200: GameListSchema, ...errors };

export function gameRoutes(auth: Authentication, deps: ApiDeps) {
  return new Elysia({ name: "module.games", prefix: "/games" })
    .use(auth)
    .post(
      "/",
      async ({ actor, body }) => {
        const { playedAt, ...rest } = body;
        const input = { ...rest, ...(playedAt && { playedAt: new Date(playedAt) }) };
        return presentGame(await deps.registerGame.execute({ actor, input }));
      },
      { auth: true, body: RegisterGameBodySchema, response: { 200: GameSchema, ...errors } },
    )
    .get("/mine", async ({ actor }) => (await deps.listPlayerGames.execute({ actor, playerId: actor.userId })).map(presentGame), {
      auth: true,
      response: list,
    })
    .get(
      "/club/:clubId",
      async ({ actor, params }) => (await deps.listClubGames.execute({ actor, clubId: params.clubId })).map(presentGame),
      { auth: true, params: z.object({ clubId: IdSchema }), response: list },
    )
    .get(
      "/player/:playerId",
      async ({ actor, params }) => (await deps.listPlayerGames.execute({ actor, playerId: params.playerId })).map(presentGame),
      { auth: true, params: z.object({ playerId: IdSchema }), response: list },
    )
    .get(
      "/shared/:playerId",
      async ({ actor, params }) => (await deps.listSharedGames.execute({ actor, playerId: params.playerId })).map(presentGame),
      { auth: true, params: z.object({ playerId: IdSchema }), response: list },
    )
    .get(
      "/ratings/:playerId",
      async ({ actor, params }) => {
        const history = await deps.getRatingHistory.execute({ actor, playerId: params.playerId });
        const points = (list: typeof history.singles) => list.map((p) => ({ ...p, playedAt: p.playedAt.toISOString() }));
        return { singles: points(history.singles), doubles: points(history.doubles) };
      },
      { auth: true, params: z.object({ playerId: IdSchema }), response: { 200: RatingHistorySchema, ...errors } },
    )
    .get("/:id", async ({ actor, params }) => presentGame(await deps.getGame.execute({ actor, gameId: params.id })), {
      auth: true,
      params: IdParamsSchema,
      response: { 200: GameSchema, ...errors },
    })
    .patch(
      "/:id",
      async ({ actor, params, body }) => {
        const { playedAt, ...rest } = body;
        const changes = { ...rest, ...(playedAt && { playedAt: new Date(playedAt) }) };
        return presentGame(await deps.updateGame.execute({ actor, gameId: params.id, changes }));
      },
      { auth: true, params: IdParamsSchema, body: UpdateGameBodySchema, response: { 200: GameSchema, ...errors } },
    )
    .delete(
      "/:id",
      async ({ actor, params, status }) => {
        await deps.deleteGame.execute({ actor, gameId: params.id });
        return status(204, undefined);
      },
      { auth: true, params: IdParamsSchema, response: { 204: z.void(), ...errors } },
    );
}
