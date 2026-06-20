import { describe, it, expect } from "bun:test";
import { createAuthedApi, createUnauthedApi } from "../helpers";

describe("Profile", () => {
  // ── My profile ──────────────────────────────────────────────────────────
  describe("GET /profile/me", () => {
    it("returns current user profile", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await api.profile.me.get();
      expect(status).toBe(200);
      expect(data!.name).toBe("Test User");
      expect(data!.userId).toBe("user-1");
    });

    it("returns 401 without auth", async () => {
      const api = createUnauthedApi();
      const { status } = await api.profile.me.get();
      expect(status).toBe(401);
    });
  });

  // ── Update profile ──────────────────────────────────────────────────────
  describe("PUT /profile/me", () => {
    it("updates and returns profile", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await api.profile.me.put({
        name: "Updated Name",
        bio: "Hello world",
      });
      expect(status).toBe(200);
      expect(data!.name).toBe("Updated Name");
      expect(data!.bio).toBe("Hello world");
    });

    it("returns 401 without auth", async () => {
      const api = createUnauthedApi();
      const { status } = await api.profile.me.put({
        name: "No Auth",
      });
      expect(status).toBe(401);
    });
  });

  // ── User profile ────────────────────────────────────────────────────────
  describe("GET /profile/:userId", () => {
    it("returns another user's profile", async () => {
      const api = createAuthedApi(["PLAYER"]);
      const { data, status } = await api.profile({ userId: "user-2" }).get();
      expect(status).toBe(200);
      expect(data!.name).toBe("Test User");
      expect(data!.userId).toBe("user-2");
    });

    it("returns 401 without auth", async () => {
      const api = createUnauthedApi();
      const { status } = await api.profile({ userId: "user-2" }).get();
      expect(status).toBe(401);
    });
  });
});
