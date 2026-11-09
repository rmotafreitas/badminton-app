import { z } from "zod";
import { IdSchema, ImageUrlSchema, IsoDateTime } from "./common";

export const GameTypeSchema = z.enum(["SINGLES", "DOUBLES"]);
export type GameType = z.infer<typeof GameTypeSchema>;

const Score = z.number().int().min(0).max(99);
export const GameSetSchema = z.object({ team1Score: Score, team2Score: Score });
export type GameSet = z.infer<typeof GameSetSchema>;
const Sets = z.array(GameSetSchema).min(1).max(5);
const TeamIds = z.array(IdSchema).min(1).max(2);

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

const Lineup = { type: GameTypeSchema, team1PlayerIds: TeamIds, team2PlayerIds: TeamIds, playedAt: IsoDateTime.optional() };

/** Full sets, or a quick result entered as points of one set. */
export const RegisterGameBodySchema = z.union([
  z.object({ clubId: IdSchema, ...Lineup, sets: Sets }),
  z.object({ clubId: IdSchema, ...Lineup, team1Points: Score, team2Points: Score }),
]);
export type RegisterGameBody = z.infer<typeof RegisterGameBodySchema>;

export const UpdateGameBodySchema = z.object({ ...Lineup, sets: Sets }).partial();
export type UpdateGameBody = z.infer<typeof UpdateGameBodySchema>;

export const RatingPointSchema = z.object({ gameId: IdSchema, playedAt: IsoDateTime, rating: z.number() });
/** `GET /api/games/ratings/:playerId`: the player's rating after each game, per discipline. */
export const RatingHistorySchema = z.object({ singles: z.array(RatingPointSchema), doubles: z.array(RatingPointSchema) });
export type RatingHistory = z.infer<typeof RatingHistorySchema>;
