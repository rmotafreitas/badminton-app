import { describe, expect, it } from "bun:test";
import { decodeStoredImage, normalizePhone } from "@bb/application";
import { gameOutcome, lineupProblem, rateGame, replayRatings } from "@bb/domain";

describe("ratings", () => {
  it("equal players: winner +16, loser -16", () => {
    const [a, b] = rateGame([{ playerId: "a", rating: 200 }], [{ playerId: "b", rating: 200 }], true);
    expect([a?.after, b?.after]).toEqual([216, 184]);
  });

  it("doubles teams play at their average", () => {
    const changes = rateGame(
      [{ playerId: "a", rating: 300 }, { playerId: "b", rating: 100 }],
      [{ playerId: "c", rating: 200 }, { playerId: "d", rating: 200 }],
      false,
    );
    expect(changes.map((c) => c.after - c.before)).toEqual([-16, -16, 16, 16]);
  });

  it("replay is order-independent of input, ordered by playedAt", () => {
    const g = (t: number, team1Won: boolean) => ({
      type: "SINGLES" as const,
      team1PlayerIds: ["a"],
      team2PlayerIds: ["b"],
      sets: [team1Won ? { team1Score: 21, team2Score: 1 } : { team1Score: 1, team2Score: 21 }],
      playedAt: new Date(t),
      createdAt: new Date(t),
    });
    const forward = replayRatings([g(1, true), g(2, false)]);
    const shuffled = replayRatings([g(2, false), g(1, true)]);
    expect(forward).toEqual(shuffled);
    expect(forward.get("a")!.doubles).toBe(200);
  });
});

describe("games", () => {
  it("outcome by sets won", () => {
    expect(gameOutcome([{ team1Score: 21, team2Score: 10 }, { team1Score: 15, team2Score: 21 }, { team1Score: 21, team2Score: 19 }])).toEqual({
      winner: "team1",
      team1SetsWon: 2,
      team2SetsWon: 1,
      isQuickMode: false,
    });
    expect(gameOutcome([{ team1Score: 10, team2Score: 10 }]).winner).toBeNull();
  });

  it("lineups", () => {
    const ok = { type: "DOUBLES" as const, team1PlayerIds: ["a", "b"], team2PlayerIds: ["c", "d"], sets: [{ team1Score: 21, team2Score: 3 }] };
    expect(lineupProblem(ok)).toBeNull();
    expect(lineupProblem({ ...ok, team2PlayerIds: ["c", "a"] })).toContain("twice");
    expect(lineupProblem({ ...ok, sets: [] })).toContain("sets");
    expect(lineupProblem({ ...ok, sets: [{ team1Score: -1, team2Score: 3 }] })).toContain("Scores");
  });
});

describe("phones", () => {
  it.each([
    ["+351 967 083 100", "+351967083100"],
    ["  +351967083100  ", "+351967083100"],
    ["(351) 967-083100", "351967083100"],
    ["", ""],
    [null, ""],
  ])("%p → %p", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("stored images", () => {
  const raw = Buffer.from([1, 2, 3]).toString("base64");
  it.each([
    [`data:image/webp;base64,${raw}`, "image/webp"],
    [`data:image/png;base64,data:image/png;base64,${raw}`, "image/png"],
    [raw, "image/webp"],
  ])("decodes %p", (stored, type) => {
    expect(decodeStoredImage(stored)).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: type });
  });

  it("is lenient with missing padding or a stray trailing character, like browsers were", () => {
    expect(decodeStoredImage(`data:image/webp;base64,${raw.replace(/=+$/, "")}`)?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(decodeStoredImage("data:image/webp;base64,AQIDB")?.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("refuses garbage", () => {
    expect(decodeStoredImage("not base64 at all!")).toBeNull();
  });
});
