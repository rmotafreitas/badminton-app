import { describe, expect, it } from "vitest";
import { evaluateShots } from "./eval";
import { applyCorrections, computeStats } from "./stats";
import type { AnalysisResult, Shot } from "./types";

const shot = (id: string, t: number, hitter: Shot["hitter"], type: Shot["type"]): Shot => ({
  id, rallyId: "r1", t, hitter, type, typeConfidence: "medium", speedKmh: null, avgSpeedKmh: null,
  speedConfidence: "low", contactHeight: null, apexHeight: null, flightTime: null, landing: null,
});

describe("evaluateShots", () => {
  it("scores precision, recall, hitter and type accuracy", () => {
    const truth = [shot("a", 1, "P1", "serve"), shot("b", 2, "P3", "lift"), shot("c", 3, "P1", "smash")];
    const pred = [shot("x", 1.05, "P1", "serve"), shot("y", 2.1, "P4", "clear"), shot("z", 5, "P2", "drive")];
    const r = evaluateShots(pred, truth);
    expect(r.matched).toBe(2);
    expect(r.hitPrecision).toBeCloseTo(2 / 3);
    expect(r.hitRecall).toBeCloseTo(2 / 3);
    expect(r.hitterAccuracy).toBe(0.5);
    expect(r.typeAccuracy).toBe(0.5);
    expect(r.confusion.lift?.clear).toBe(1);
  });
});

describe("corrections: added shots", () => {
  it("inserts missed hits into their rally and counts them", () => {
    const shots = [shot("r1s1", 1, "P1", "serve"), shot("r1s2", 2, "P3", "lift")];
    const base = {
      version: 1, createdAt: "", engine: { runtime: "", backend: "", models: [] },
      video: { width: 1, height: 1, fps: 30, durationS: 10, analysedFps: 30 }, format: "doubles",
      calibration: null, players: [{ id: "P1", side: -1 }, { id: "P3", side: 1 }], tracks: [], shuttle: [],
      rallies: [{ id: "r1", start: 1, end: 3.5, shotIds: ["r1s1", "r1s2"] }], shots,
      stats: computeStats({ tracks: [], shots, rallies: [], players: [] }),
    } as unknown as AnalysisResult;
    const r = applyCorrections(base, { added: [{ id: "add-1", t: 2.6, hitter: "P1", type: "smash" }] });
    expect(r.rallies[0]!.shotIds).toEqual(["r1s1", "r1s2", "add-1"]);
    expect(r.stats.shots).toBe(3);
    expect(r.stats.players.find((p) => p.id === "P1")!.shotsByType.smash).toBe(1);
  });
});
