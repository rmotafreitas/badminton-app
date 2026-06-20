import { describe, it, expect } from "bun:test";
import { createAuthedApi } from "../helpers";

describe("Clubs", () => {
  // ── Admin create ────────────────────────────────────────────────────────
  describe("POST /clubs/admin/", () => {
    it("creates a club as SYSTEM_ADMIN", async () => {
      const api = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await (api.clubs.admin as any).post({
        name: "New Club",
      });
      expect(status).toBe(200);
      expect(data!.name).toBe("New Club");
    });

    it("returns 403 for PLAYER", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { status } = await (api.clubs.admin as any).post({
        name: "New Club",
      });
      expect(status).toBe(403);
    });
  });

  // ── Admin list ──────────────────────────────────────────────────────────
  describe("GET /clubs/admin/", () => {
    it("returns all clubs as SYSTEM_ADMIN", async () => {
      const api = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await (api.clubs.admin as any).get();
      expect(status).toBe(200);
      expect(data).toBeArray();
    });
  });

  // ── Admin assign ────────────────────────────────────────────────────────
  describe("POST /clubs/admin/assign", () => {
    it("assigns a user to a club as SYSTEM_ADMIN", async () => {
      const api = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await api.clubs.admin.assign.post({
        userId: "user-1",
        clubId: "club-1",
      });
      expect(status).toBe(200);
      expect(data!.id).toBe("club-1");
      expect(data!.name).toBe("Test Club");
    });

    it("returns 403 for PLAYER", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { status } = await api.clubs.admin.assign.post({
        userId: "user-1",
        clubId: "club-1",
      });
      expect(status).toBe(403);
    });
  });

  // ── Manage update ───────────────────────────────────────────────────────
  describe("PUT /clubs/manage/:id", () => {
    it("updates club as SYSTEM_ADMIN", async () => {
      const api = createAuthedApi(["SYSTEM_ADMIN"]);
      const { data, status } = await api.clubs.manage({ id: "club-1" }).put({
        name: "Renamed Club",
        location: "New Location",
      });
      expect(status).toBe(200);
      expect(data!.name).toBe("Renamed Club");
      expect(data!.location).toBe("New Location");
    });

    it("returns 403 for PLAYER trying to update", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { status } = await api.clubs.manage({ id: "club-1" }).put({
        name: "Hacked Club",
      });
      expect(status).toBe(403);
    });
  });

  // ── Get by id ───────────────────────────────────────────────────────────
  describe("GET /clubs/:id", () => {
    it("returns club details for PLAYER", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await api.clubs({ id: "club-1" }).get();
      expect(status).toBe(200);
      expect(data!.name).toBe("Test Club");
    });
  });

  // ── Multi-role access ──────────────────────────────────────────────────
  describe("multi-role access", () => {
    it("CLUB_ADMIN+PLAYER can update club (has CLUB_ADMIN role)", async () => {
      const api = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { data, status } = await api.clubs.manage({
        id: "club-1",
      }).put({
        name: "Multi-Role Updated",
      });
      expect(status).toBe(200);
      expect(data!.name).toBe("Multi-Role Updated");
    });

    it("CLUB_ADMIN+PLAYER cannot create club (needs SYSTEM_ADMIN)", async () => {
      const api = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { status } = await (api.clubs.admin as any).post({
        name: "Should Fail",
      });
      expect(status).toBe(403);
    });

    it("CLUB_ADMIN+PLAYER can view club details", async () => {
      const api = createAuthedApi(["CLUB_ADMIN", "PLAYER"]);
      const { data, status } = await api.clubs({ id: "club-1" }).get();
      expect(status).toBe(200);
      expect(data!.name).toBeTruthy();
    });
  });
});
