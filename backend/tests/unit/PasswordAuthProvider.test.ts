import { describe, it, expect } from "bun:test";
import { PasswordAuthProvider } from "../../src/application/providers/PasswordAuthProvider";
import type { IUserRepo } from "../../src/domain/repositories/IUserRepo";
import type { User } from "../../src/domain/entities/User";
import { mockUserRepo } from "../helpers";

function seededUserRepo(email: string, passwordHash: string | null): IUserRepo {
  const repo = mockUserRepo();
  const user: User = {
    id: "seed-user-1",
    email,
    phone: null,
    passwordHash,
    role: "PLAYER",
    isActive: true,
    lastAccess: null,
    clubId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  (repo as any).findByEmail = async () => user;
  return repo;
}

describe("PasswordAuthProvider", () => {
  it("providerType is 'password'", () => {
    const repo = mockUserRepo();
    const provider = new PasswordAuthProvider(repo);
    expect(provider.providerType).toBe("password");
  });

  describe("initiate", () => {
    it("returns code-sent confirmation", async () => {
      const repo = mockUserRepo();
      const provider = new PasswordAuthProvider(repo);
      const result = await provider.initiate({});
      expect(result.type).toBe("code-sent");
      expect(result.message).toBeString();
    });
  });

  describe("complete", () => {
    it("returns identity when password is correct", async () => {
      const hash = await PasswordAuthProvider.hashPassword("mypassword");
      const repo = seededUserRepo("user@test.com", hash);
      const provider = new PasswordAuthProvider(repo);

      const identity = await provider.complete({
        email: "user@test.com",
        password: "mypassword",
      });

      expect(identity.providerId).toBe("user@test.com");
      expect(identity.email).toBe("user@test.com");
    });

    it("returns identity when using phone with correct password", async () => {
      const hash = await PasswordAuthProvider.hashPassword("mypassword");
      const repo = mockUserRepo();
      const user: User = {
        id: "seed-user-2",
        email: null,
        phone: "+351 912 345 678",
        passwordHash: hash,
        role: "PLAYER",
        isActive: true,
        lastAccess: null,
        clubId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (repo as any).findByPhone = async () => user;
      const provider = new PasswordAuthProvider(repo);

      const identity = await provider.complete({
        phone: "+351 912 345 678",
        password: "mypassword",
      });

      expect(identity.providerId).toBe("+351 912 345 678");
      expect(identity.phone).toBe("+351 912 345 678");
    });

    it("throws on wrong password", async () => {
      const hash = await PasswordAuthProvider.hashPassword("mypassword");
      const repo = seededUserRepo("user@test.com", hash);
      const provider = new PasswordAuthProvider(repo);

      expect(
        provider.complete({ email: "user@test.com", password: "wrong" }),
      ).rejects.toThrow("Invalid credentials");
    });

    it("throws when user has no password set", async () => {
      const repo = seededUserRepo("user@test.com", null);
      const provider = new PasswordAuthProvider(repo);

      expect(
        provider.complete({ email: "user@test.com", password: "anything" }),
      ).rejects.toThrow("No password set for this account");
    });

    it("throws when user not found", async () => {
      const repo = mockUserRepo();
      const provider = new PasswordAuthProvider(repo);

      expect(
        provider.complete({ email: "nobody@test.com", password: "anything" }),
      ).rejects.toThrow("Invalid credentials");
    });

    it("throws when password field is missing", async () => {
      const repo = mockUserRepo();
      const provider = new PasswordAuthProvider(repo);

      expect(
        provider.complete({ email: "user@test.com" }),
      ).rejects.toThrow("Password is required");
    });

    it("throws when email and phone are both missing", async () => {
      const repo = mockUserRepo();
      const provider = new PasswordAuthProvider(repo);

      expect(
        provider.complete({ password: "anything" }),
      ).rejects.toThrow("Email or phone is required");
    });
  });

  describe("hashPassword", () => {
    it("produces a bcrypt hash string", async () => {
      const hash = await PasswordAuthProvider.hashPassword("test123");
      expect(hash).toBeString();
      expect(hash.length).toBeGreaterThan(20);
    });

    it("produces different hashes for same password", async () => {
      const h1 = await PasswordAuthProvider.hashPassword("test123");
      const h2 = await PasswordAuthProvider.hashPassword("test123");
      expect(h1).not.toBe(h2); // bcrypt salts are unique
    });
  });
});
