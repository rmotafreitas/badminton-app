import type { Game } from "@bb/contracts";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Api } from "@/app/api";
import { forgetGame, gameKeys, gameQuery, rememberGame } from "./api";

const player = (id: string) => ({ id, name: id, photoUrl: null });
const game = (id: string, playedAt: string, players: [string, string] = ["ana", "bruno"], clubId = "club1"): Game => ({
  id,
  type: "SINGLES",
  clubId,
  team1Players: [player(players[0])],
  team2Players: [player(players[1])],
  sets: [{ team1Score: 21, team2Score: 15 }],
  registeredById: players[0],
  playedAt,
  createdAt: playedAt,
  winner: "team1",
  team1SetsWon: 1,
  team2SetsWon: 0,
  isQuickMode: true,
});
// The detail query never reaches the network in these tests.
const api = {} as Api;

describe("game caches", () => {
  it("a game opened from a list paints at once with the list's copy", async () => {
    const qc = new QueryClient();
    const g = game("g1", "2026-11-01T10:00:00.000Z");
    qc.setQueryData(gameKeys.club("club1"), [g]);
    const shown = await qc.ensureQueryData(gameQuery(api, "g1", qc));
    expect(shown).toEqual(g);
    // …and it is marked as old as the list, so a stale list still triggers a background refetch of the detail.
    expect(qc.getQueryState(gameKeys.detail("g1"))?.dataUpdatedAt).toBe(qc.getQueryState(gameKeys.club("club1"))?.dataUpdatedAt);
  });

  it("a saved new game appears in its club list and in 'mine' only for a player", () => {
    const qc = new QueryClient();
    const older = game("g0", "2026-10-01T10:00:00.000Z");
    qc.setQueryData(gameKeys.club("club1"), [older]);
    qc.setQueryData(gameKeys.club("club2"), []);
    qc.setQueryData(gameKeys.mine(), [older]);
    const saved = game("g1", "2026-11-01T10:00:00.000Z");

    rememberGame(qc, saved, { isNew: true, viewerId: "coach" });
    expect(qc.getQueryData<Game[]>(gameKeys.club("club1"))?.map((g) => g.id)).toEqual(["g1", "g0"]);
    expect(qc.getQueryData<Game[]>(gameKeys.club("club2"))).toEqual([]);
    expect(qc.getQueryData<Game[]>(gameKeys.mine())?.map((g) => g.id)).toEqual(["g0"]);
    expect(qc.getQueryData(gameKeys.detail("g1"))).toEqual(saved);

    const qc2 = new QueryClient();
    qc2.setQueryData(gameKeys.mine(), [older]);
    rememberGame(qc2, saved, { isNew: true, viewerId: "ana" });
    expect(qc2.getQueryData<Game[]>(gameKeys.mine())?.map((g) => g.id)).toEqual(["g1", "g0"]);
  });

  it("an edited game is replaced in place (and re-sorted by when it was played)", () => {
    const qc = new QueryClient();
    qc.setQueryData(gameKeys.mine(), [game("g2", "2026-11-02T10:00:00.000Z"), game("g1", "2026-11-01T10:00:00.000Z")]);
    rememberGame(qc, { ...game("g1", "2026-11-03T10:00:00.000Z"), winner: "team2" }, { isNew: false, viewerId: "ana" });
    const mine = qc.getQueryData<Game[]>(gameKeys.mine());
    expect(mine?.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(mine?.[0]?.winner).toBe("team2");
  });

  it("a deleted game leaves every list and its detail", () => {
    const qc = new QueryClient();
    const g = game("g1", "2026-11-01T10:00:00.000Z");
    qc.setQueryData(gameKeys.mine(), [g]);
    qc.setQueryData(gameKeys.club("club1"), [g]);
    qc.setQueryData(gameKeys.detail("g1"), g);
    forgetGame(qc, "g1");
    expect(qc.getQueryData(gameKeys.mine())).toEqual([]);
    expect(qc.getQueryData(gameKeys.club("club1"))).toEqual([]);
    expect(qc.getQueryData(gameKeys.detail("g1"))).toBeUndefined();
  });
});
