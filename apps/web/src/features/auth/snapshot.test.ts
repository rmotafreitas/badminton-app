// @vitest-environment happy-dom
import type { SessionUser } from "@bb/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { sessionSnapshot } from "./snapshot";

const user: SessionUser = {
  id: "0000000000000000000000aa",
  name: "Ana",
  email: "ana@test.pt",
  phone: null,
  roles: ["PLAYER"],
  clubId: null,
  eloSingles: 200,
  eloDoubles: 200,
  photoUrl: null,
};

describe("session snapshot", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips the user and holds no token", () => {
    sessionSnapshot.save(user);
    expect(sessionSnapshot.read()).toEqual(user);
    expect(JSON.stringify(localStorage)).not.toMatch(/token|session=/i);
  });

  it("ignores corrupted or foreign data", () => {
    localStorage.setItem("bb:session-snapshot:v1", "{not json");
    expect(sessionSnapshot.read()).toBeNull();
    localStorage.setItem("bb:session-snapshot:v1", JSON.stringify({ hello: "world" }));
    expect(sessionSnapshot.read()).toBeNull();
  });

  it("clear also removes the old app's cached user and query cache", () => {
    sessionSnapshot.save(user);
    localStorage.setItem("badminton-auth-user", "{}");
    localStorage.setItem("qc:games", "{}");
    localStorage.setItem("badminton-lang", "pt-PT");
    sessionSnapshot.clear();
    expect(Object.keys(localStorage)).toEqual(["badminton-lang"]);
  });
});
