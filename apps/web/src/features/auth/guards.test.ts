import { describe, expect, it } from "vitest";
import { hasRole, isStaff, safeRedirect } from "./guards";

describe("safeRedirect (no open redirect through ?redirect=)", () => {
  it.each([
    ["/games/abc?x=1", "/games/abc?x=1"],
    ["https://evil.test/", "/dashboard"],
    ["//evil.test", "/dashboard"],
    ["/\\evil.test", "/dashboard"],
    ["javascript:alert(1)", "/dashboard"],
    [undefined, "/dashboard"],
    [42, "/dashboard"],
  ])("%p → %p", (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });
});

describe("roles", () => {
  it("staff are coaches and admins", () => {
    expect(isStaff({ roles: ["PLAYER"] })).toBe(false);
    expect(isStaff({ roles: ["PLAYER", "COACH"] })).toBe(true);
    expect(hasRole(null, "PLAYER")).toBe(false);
  });
});
