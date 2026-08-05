import { describe, it, expect, beforeEach, mock, type Mock } from "bun:test";
import { GameService } from "../../src/application/services/GameService";
import type { IGameRepo } from "../../src/domain/repositories/IGameRepo";
import type { IUserRepo } from "../../src/domain/repositories/IUserRepo";
import type { Game, GameType } from "../../src/domain/entities/Game";
import type { User, Role } from "../../src/domain/entities/User";

describe("GameService", () => {
  let gameService: GameService;
  let mockGameRepo: ReturnType<typeof createMockGameRepo>;
  let mockUserRepo: ReturnType<typeof createMockUserRepo>;

  beforeEach(() => {
    mockGameRepo = createMockGameRepo();
    mockUserRepo = createMockUserRepo();
    gameService = new GameService(mockGameRepo, mockUserRepo);
  });

  describe("registerGame", () => {
    it("should allow a PLAYER to register a game if they participated in team 1", async () => {
      const currentUser = { sub: "player1-id", roles: ["PLAYER"] };
      const gameData = {
        clubId: "club1-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      const result = await gameService.registerGame(currentUser, gameData);

      expect(mockGameRepo.create).toHaveBeenCalled();
      expect(result.team1PlayerIds).toContain("player1-id");
    });

    it("should reject a PLAYER trying to register a game they did not participate in", async () => {
      const currentUser = { sub: "player3-id", roles: ["PLAYER"] };
      const gameData = {
        clubId: "club1-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      expect(gameService.registerGame(currentUser, gameData)).rejects.toThrow(
        "Players can only register games they participated in.",
      );
      expect(mockGameRepo.create).not.toHaveBeenCalled();
    });

    it("should allow a COACH to register a game for their club", async () => {
      const currentUser = { sub: "coach1-id", roles: ["COACH"] };
      mockUserRepo.findById.mockResolvedValue({
        id: "coach1-id",
        clubId: "club1-id",
        roles: ["COACH"],
      } as User);

      const gameData = {
        clubId: "club1-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      const result = await gameService.registerGame(currentUser, gameData);

      expect(mockUserRepo.findById).toHaveBeenCalledWith("coach1-id");
      expect(mockGameRepo.create).toHaveBeenCalled();
      expect(result.clubId).toBe("club1-id");
    });

    it("should reject a COACH trying to register a game for another club", async () => {
      const currentUser = { sub: "coach1-id", roles: ["COACH"] };
      mockUserRepo.findById.mockResolvedValue({
        id: "coach1-id",
        clubId: "club1-id",
        roles: ["COACH"],
      } as User);

      const gameData = {
        clubId: "club2-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      expect(gameService.registerGame(currentUser, gameData)).rejects.toThrow(
        "You can only register games for your own club.",
      );
      expect(mockGameRepo.create).not.toHaveBeenCalled();
    });

    it("should allow CLUB_ADMIN+PLAYER to register game for their club without participating", async () => {
      const currentUser = { sub: "admin1-id", roles: ["CLUB_ADMIN", "PLAYER"] };
      mockUserRepo.findById.mockResolvedValue({
        id: "admin1-id",
        clubId: "club1-id",
        roles: ["CLUB_ADMIN", "PLAYER"],
      } as User);

      const gameData = {
        clubId: "club1-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      const result = await gameService.registerGame(currentUser, gameData);

      expect(mockGameRepo.create).toHaveBeenCalled();
      expect(result.clubId).toBe("club1-id");
    });

    it("should allow SYSTEM_ADMIN to register any game without checks", async () => {
      const currentUser = { sub: "sysadmin-id", roles: ["SYSTEM_ADMIN"] };

      const gameData = {
        clubId: "club99-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      const result = await gameService.registerGame(currentUser, gameData);

      expect(mockGameRepo.create).toHaveBeenCalled();
      expect(result.clubId).toBe("club99-id");
    });

    it("should allow COACH+PLAYER to register game for their club without participating", async () => {
      const currentUser = { sub: "coach2-id", roles: ["COACH", "PLAYER"] };
      mockUserRepo.findById.mockResolvedValue({
        id: "coach2-id",
        clubId: "club1-id",
        roles: ["COACH", "PLAYER"],
      } as User);

      const gameData = {
        clubId: "club1-id",
        type: "SINGLES" as GameType,
        team1PlayerIds: ["player1-id"],
        team2PlayerIds: ["player2-id"],
        sets: [{ team1Score: 21, team2Score: 19 }],
        registeredById: currentUser.sub,
      };

      const result = await gameService.registerGame(currentUser, gameData);

      expect(mockGameRepo.create).toHaveBeenCalled();
      expect(result.clubId).toBe("club1-id");
    });
  });
});

function createMockGameRepo() {
  return {
    create: mock((data: any) =>
      Promise.resolve({ id: "game-id", ...data, createdAt: new Date() }),
    ),
    findRecentByClub: mock(() => Promise.resolve([])),
    findByPlayerId: mock(() => Promise.resolve([])),
    findById: mock(),
    update: mock(),
    delete: mock(),
  };
}

function createMockUserRepo() {
  return {
    findById: mock(),
    findByEmail: mock(),
    findByPhone: mock(),
    findByAuthMethod: mock(),
    createUserWithAuthMethod: mock(),
    linkAuthMethod: mock(),
    assignClub: mock(),
    findByIds: mock((ids: string[]) =>
      Promise.resolve(ids.map((id) => ({ id, eloSingles: 200, eloDoubles: 200, roles: ["PLAYER"] } as User))),
    ),
    updateEloSingles: mock(() => Promise.resolve()),
    updateEloDoubles: mock(() => Promise.resolve()),
    setPasswordHash: mock(),
    findAll: mock(),
  };
}
