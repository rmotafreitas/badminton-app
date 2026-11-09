import { type Actor, isClubStaff, isSameClub, isSystemAdmin } from "@/shared/actor";
import { type Game, playsIn } from "./game";

/**
 * Who may see a game: admins everything, club staff their club's games, players the games they played.
 * Unauthorised callers get NotFound, so game ids don't leak.
 */
export function canViewGame(actor: Actor, game: Pick<Game, "clubId" | "team1PlayerIds" | "team2PlayerIds">): boolean {
  if (isSystemAdmin(actor)) return true;
  if (isClubStaff(actor) && isSameClub(actor, game.clubId)) return true;
  return playsIn(game, actor.userId);
}

/** Editing and deleting follow the same rule as viewing. */
export const canChangeGame = canViewGame;

/**
 * Registering: admins anywhere; staff for their own club; a player only for their own club and only a game they
 * played in.
 */
export function registerGameProblem(actor: Actor, clubId: string, playerIds: readonly string[]): string | null {
  if (isSystemAdmin(actor)) return null;
  if (!isSameClub(actor, clubId)) return "You can only register games for your own club.";
  if (isClubStaff(actor)) return null;
  if (!playerIds.includes(actor.userId)) return "Players can only register games they played in.";
  return null;
}

/** Which of a club's games a caller sees in the club list. */
export function visibleClubGames<G extends Pick<Game, "clubId" | "team1PlayerIds" | "team2PlayerIds">>(
  actor: Actor,
  clubId: string,
  games: readonly G[],
): G[] {
  if (isSystemAdmin(actor) || (isClubStaff(actor) && isSameClub(actor, clubId))) return [...games];
  return games.filter((g) => playsIn(g, actor.userId));
}
