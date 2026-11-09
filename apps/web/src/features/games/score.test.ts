import { describe, expect, it } from "vitest";
import { checkScore } from "./score";

describe("badminton scores", () => {
  it.each([
    [21, 15, null],
    [22, 20, null],
    [30, 29, null],
    [11, 5, null],
    [21, 21, "scoreDraw"],
    [21, 20, "scoreWinBy2"],
    [31, 29, "scoreMax30"],
    [-1, 21, "scoreNeg"],
    [3, 0, "scoreTooLow"],
  ] as const)("%i–%i → %p", (a, b, expected) => {
    expect(checkScore(a, b)).toBe(expected);
  });
});
