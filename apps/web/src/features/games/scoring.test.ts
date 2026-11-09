import { describe, expect, it } from "vitest";
import { gameWinner, type LiveMatch, loserOptions, newMatch, point, replay, type Side, undo } from "./scoring";

const play = (match: LiveMatch, ...sides: Side[]) => sides.reduce(point, match);
const many = (side: Side, n: number) => Array.from({ length: n }, () => side);

describe("game rules", () => {
  it.each([
    [21, 19, 1],
    [19, 21, 2],
    [21, 20, null],
    [22, 20, 1],
    [29, 29, null],
    [30, 29, 1],
    [29, 30, 2],
    [20, 15, null],
  ] as const)("%i–%i → %p", (a, b, winner) => {
    expect(gameWinner({ a, b })).toBe(winner);
  });

  it("offers only valid losing scores", () => {
    expect(loserOptions(21)).toHaveLength(20);
    expect(loserOptions(25)).toEqual([23]);
    expect(loserOptions(30)).toEqual([28, 29]);
  });
});

describe("live match", () => {
  it("serves from the right on an even score, left on odd; the rally winner serves", () => {
    let m = newMatch(1);
    expect(replay(m)).toMatchObject({ server: 1, serviceCourt: "right" });
    m = point(m, 2);
    expect(replay(m)).toMatchObject({ server: 2, serviceCourt: "left", current: { a: 0, b: 1 } });
    m = point(m, 2);
    expect(replay(m)).toMatchObject({ server: 2, serviceCourt: "right" });
  });

  it("ends a game at 21, starts the next on the next rally, ends the match at two games", () => {
    let m = play(newMatch(), ...many(1, 21));
    let s = replay(m);
    expect(s).toMatchObject({ gameOver: true, gamesWon: { a: 1, b: 0 }, matchWinner: null, current: { a: 21, b: 0 } });
    m = point(m, 2);
    s = replay(m);
    expect(s).toMatchObject({ gameOver: false, gameNumber: 2, current: { a: 0, b: 1 } });
    m = play(m, ...many(1, 21));
    s = replay(m);
    expect(s.matchWinner).toBe(1);
    expect(s.games).toEqual([
      { a: 21, b: 0 },
      { a: 21, b: 1 },
    ]);
    // No more points after the match is decided.
    expect(point(m, 2)).toBe(m);
  });

  it("deuce goes on to 30", () => {
    const m = play(newMatch(), ...Array.from({ length: 29 }, () => [1, 2] as Side[]).flat(), 1);
    expect(replay(m)).toMatchObject({ gameOver: true, current: { a: 30, b: 29 } });
  });

  it("change ends at 11 in the deciding game only", () => {
    let m = play(newMatch(), ...many(1, 11));
    expect(replay(m).changeEnds).toBe(false);
    m = play(newMatch(), ...many(1, 21), ...many(2, 21), ...many(1, 11));
    expect(replay(m)).toMatchObject({ gameNumber: 3, changeEnds: true });
    expect(replay(point(m, 1)).changeEnds).toBe(false);
  });

  it("undo walks back across a finished game", () => {
    const m = play(newMatch(), ...many(1, 21));
    const back = undo(m);
    expect(replay(back)).toMatchObject({ gameOver: false, current: { a: 20, b: 0 }, gamesWon: { a: 0, b: 0 } });
  });
});
