import { z } from "zod";
import { IdSchema, ImageUrlSchema, IsoDateTime } from "./common";

export const GameTypeSchema = z.enum(["SINGLES", "DOUBLES"]);
export type GameType = z.infer<typeof GameTypeSchema>;

export const GameSetSchema = z.object({
  team1Score: z.number().int().min(0).max(99),
  team2Score: z.number().int().min(0).max(99),
});
export type GameSet = z.infer<typeof GameSetSchema>;

export const GamePlayerSchema = z.object({
  id: IdSchema,
  name: z.string().nullable(),
  photoUrl: ImageUrlSchema,
});
export type GamePlayer = z.infer<typeof GamePlayerSchema>;

export const GameSchema = z.object({
  id: IdSchema,
  type: GameTypeSchema,
  clubId: IdSchema,
  team1Players: z.array(GamePlayerSchema),
  team2Players: z.array(GamePlayerSchema),
  sets: z.array(GameSetSchema),
  registeredById: IdSchema,
  playedAt: IsoDateTime,
  createdAt: IsoDateTime,
  winner: z.enum(["team1", "team2"]).nullable(),
  team1SetsWon: z.number().int(),
  team2SetsWon: z.number().int(),
  isQuickMode: z.boolean(),
});
export type Game = z.infer<typeof GameSchema>;
export const GameListSchema = z.array(GameSchema);

const Lineup = {
  type: GameTypeSchema,
  team1PlayerIds: z.array(IdSchema).min(1).max(2),
  team2PlayerIds: z.array(IdSchema).min(1).max(2),
  playedAt: IsoDateTime.optional(),
};

/** Full sets, or a quick result entered as points of one set. */
export const RegisterGameBodySchema = z.union([
  z.object({ clubId: IdSchema, ...Lineup, sets: z.array(GameSetSchema).min(1).max(5) }),
  z.object({
    clubId: IdSchema,
    ...Lineup,
    team1Points: z.number().int().min(0).max(99),
    team2Points: z.number().int().min(0).max(99),
  }),
]);
export type RegisterGameBody = z.infer<typeof RegisterGameBodySchema>;

export const UpdateGameBodySchema = z.object({
  type: GameTypeSchema.optional(),
  team1PlayerIds: z.array(IdSchema).min(1).max(2).optional(),
  team2PlayerIds: z.array(IdSchema).min(1).max(2).optional(),
  sets: z.array(GameSetSchema).min(1).max(5).optional(),
  playedAt: IsoDateTime.optional(),
});
export type UpdateGameBody = z.infer<typeof UpdateGameBodySchema>;

export const RatingPointSchema = z.object({ gameId: IdSchema, playedAt: IsoDateTime, rating: z.number() });
/** `GET /api/games/ratings/:playerId`: the player's rating after each game, per discipline. */
export const RatingHistorySchema = z.object({ singles: z.array(RatingPointSchema), doubles: z.array(RatingPointSchema) });
export type RatingHistory = z.infer<typeof RatingHistorySchema>;
