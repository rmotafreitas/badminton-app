import { describe, it, expect } from "bun:test";
import { normalizePhone } from "../../src/application/utils/normalizePhone";

describe("normalizePhone", () => {
  it("strips internal spaces and keeps the leading +", () => {
    expect(normalizePhone("+351 967 083 100")).toBe("+351967083100");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePhone("  +351967083100  ")).toBe("+351967083100");
  });

  it("is a no-op for already-canonical input", () => {
    expect(normalizePhone("+351967083100")).toBe("+351967083100");
  });

  it("removes separators like parentheses and dashes", () => {
    expect(normalizePhone("(351) 967-083-100")).toBe("351967083100");
  });

  it("drops the + when there are no digits after it", () => {
    expect(normalizePhone("+  ")).toBe("");
  });

  it("returns empty string for null/undefined/empty", () => {
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
    expect(normalizePhone("")).toBe("");
  });

  it("handles a phone without a country code", () => {
    expect(normalizePhone("967 083 100")).toBe("967083100");
  });
});
