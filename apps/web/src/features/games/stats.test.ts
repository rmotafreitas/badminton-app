import type { Game } from "@bb/contracts";
import { describe, expect, it } from "vitest";
import { outcomeFor, playerStats, scoreLine } from "./stats";

const p = (id: string) => ({ id, name: id, photoUrl: null });
const game = (id: string, playedAt: string, winner: "team1" | "team2", sets = [{ team1Score: 21, team2Score: 10 }]): Game => ({
  id,
  type: "SINGLES",
  clubId: "c",
  team1Players: [p("me")],
  team2Players: [p("you")],
  sets,
  registeredById: "me",
  playedAt,
  createdAt: playedAt,
  winner,
  team1SetsWon: 1,
  team2SetsWon: 0,
  isQuickMode: true,
});

describe("player stats", () => {
  const games = [
    game("1", "2026-01-01T10:00:00Z", "team1"),
    game("2", "2026-01-02T10:00:00Z", "team1"),
    game("3", "2026-01-03T10:00:00Z", "team2"),
    game("4", "2026-01-04T10:00:00Z", "team2"),
  ];

  it("counts results, streaks and form", () => {
    const stats = playerStats(games, "me");
    expect([stats.wins, stats.losses, stats.winRate]).toEqual([2, 2, 50]);
    expect(stats.streak).toEqual({ kind: "L", count: 2 });
    expect(stats.bestStreak).toBe(2);
    expect(stats.form.map((f) => f.outcome)).toEqual(["L", "L", "W", "W"]);
  });

  it("ignores games the player wasn't in", () => {
    expect(playerStats(games, "stranger").total).toBe(0);
    expect(outcomeFor(games[0]!, "stranger")).toBeNull();
  });

  it("shows the score from the player's side", () => {
    expect(scoreLine(games[0]!, "you")).toBe("10–21");
    expect(scoreLine(games[0]!, "me")).toBe("21–10");
  });
});
