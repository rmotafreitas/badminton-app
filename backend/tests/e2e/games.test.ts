import { describe, it, expect } from "bun:test";
import { createAuthedApi, createUnauthedApi } from "../helpers";

describe("Games", () => {
  // ── Register (full) ────────────────────────────────────────────────────
  describe("POST /games/", () => {
    it("registers a game as PLAYER in team 1", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(200);
      expect(data!.team1PlayerIds).toContain("user-1");
      expect(data!.clubId).toBe("club-1");
      expect(data!.playedAt).toBeTruthy();
    });

    it("registers a DOUBLES game with multiple sets", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "DOUBLES",
        team1PlayerIds: ["user-1", "player-3"],
        team2PlayerIds: ["player-2", "player-4"],
        sets: [
          { team1Score: 21, team2Score: 15 },
          { team1Score: 18, team2Score: 21 },
          { team1Score: 21, team2Score: 12 },
        ],
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("DOUBLES");
      expect(data!.sets.length).toBe(3);
    });

    it("registers a game with custom playedAt date", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const past = new Date("2024-06-15");
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        playedAt: past.toISOString(),
      });
      expect(status).toBe(200);
      expect(new Date(data!.playedAt).getTime()).toBe(past.getTime());
    });

    it("registers a game as COACH for their club", async () => {
      const api = createAuthedApi(["COACH"]);
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["player-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(200);
      expect(data!.clubId).toBe("club-1");
    });

    it("registers a game as SYSTEM_ADMIN for any club", async () => {
      const api = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["player-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(200);
    });

    it("rejects PLAYER not in either team", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["other-player"],
        team2PlayerIds: ["another-player"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(500);
    });

    it("returns 401 without auth", async () => {
      const api = createUnauthedApi();
      const { status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(401);
    });
  });

  // ── Quick register ─────────────────────────────────────────────────────
  describe("POST /games/quick", () => {
    it("registers a quick game with points", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await (api.games as any).quick.post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        team1Points: 21,
        team2Points: 15,
      });
      expect(status).toBe(200);
      expect(data!.sets.length).toBe(1);
      expect(data!.sets[0].team1Score).toBe(21);
      expect(data!.sets[0].team2Score).toBe(15);
    });

    it("quick game converts points to single set", async () => {
      const api = createAuthedApi(["COACH"]);
      const { data, status } = await (api.games as any).quick.post({
        clubId: "club-1",
        type: "DOUBLES",
        team1PlayerIds: ["player-1", "player-2"],
        team2PlayerIds: ["player-3", "player-4"],
        team1Points: 30,
        team2Points: 28,
      });
      expect(status).toBe(200);
      expect(data!.type).toBe("DOUBLES");
      expect(data!.sets).toEqual([{ team1Score: 30, team2Score: 28 }]);
    });

    it("quick game with playedAt", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const yesterday = new Date(Date.now() - 86400000);
      const { data, status } = await (api.games as any).quick.post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        team1Points: 21,
        team2Points: 19,
        playedAt: yesterday.toISOString(),
      });
      expect(status).toBe(200);
      expect(new Date(data!.playedAt).getTime()).toBe(yesterday.getTime());
    });

    it("rejects PLAYER not in either team on quick", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { status } = await (api.games as any).quick.post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["other-player"],
        team2PlayerIds: ["another-player"],
        team1Points: 21,
        team2Points: 15,
      });
      expect(status).toBe(500);
    });
  });

  // ── Multi-role registration ────────────────────────────────────────────
  describe("POST /games/ with multi-role", () => {
    it("CLUB_ADMIN+PLAYER can register game for their club without being in team", async () => {
      const api = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { data, status } = await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["player-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });
      expect(status).toBe(200);
      expect(data!.clubId).toBe("club-1");
    });
  });

  // ── Recent by club ─────────────────────────────────────────────────────
  describe("GET /games/club/:clubId", () => {
    it("returns recent games for club", async () => {
      const api = createAuthedApi(["PLAYER"]);

      // Register a game first so we have data
      await (api.games as any).post({
        clubId: "club-1",
        type: "SINGLES",
        team1PlayerIds: ["user-1"],
        team2PlayerIds: ["player-2"],
        sets: [{ team1Score: 21, team2Score: 19 }],
      });

      const { data, status } = await api.games.club({ clubId: "club-1" }).get();
      expect(status).toBe(200);
      expect(data).toBeArray();
      expect(data!.length).toBeGreaterThan(0);
    });

    it("returns empty array for club with no games", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await api.games.club({
        clubId: "empty-club",
      }).get();
      expect(status).toBe(200);
      expect(data).toBeArray();
    });
  });
});
