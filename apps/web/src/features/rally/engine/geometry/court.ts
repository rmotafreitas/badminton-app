/**
 * BWF badminton court model in metres.
 *
 * World frame: origin at the centre of the net on the floor.
 *   x → across the court (−3.05 … +3.05, doubles sidelines)
 *   y → along the court  (−6.70 … +6.70, baselines); the net is y = 0
 *   z → up
 * "Near" half is y < 0 by convention (the half closest to the camera once
 * calibrated).
 */
import type { Vec2 } from "./linalg";

export const COURT = {
  length: 13.4,
  halfLength: 6.7,
  doublesWidth: 6.1,
  halfDoublesWidth: 3.05,
  halfSinglesWidth: 2.59,
  /** Short service line distance from the net. */
  shortService: 1.98,
  /** Doubles long service line distance from the net. */
  longServiceDoubles: 6.7 - 0.76,
  netHeightPosts: 1.55,
  netHeightCentre: 1.524,
} as const;

export interface CourtLine {
  id: string;
  a: Vec2;
  b: Vec2;
  /** "across" lines are parallel to the net; "along" lines run baseline to baseline. */
  family: "across" | "along";
}

const { halfLength: L, halfDoublesWidth: W, halfSinglesWidth: S, shortService: SS, longServiceDoubles: LS } =
  COURT;

/** Every painted line on a standard court. */
export const COURT_LINES: readonly CourtLine[] = [
  // across (parallel to net)
  { id: "baseline-far", a: { x: -W, y: L }, b: { x: W, y: L }, family: "across" },
  { id: "long-service-far", a: { x: -W, y: LS }, b: { x: W, y: LS }, family: "across" },
  { id: "short-service-far", a: { x: -W, y: SS }, b: { x: W, y: SS }, family: "across" },
  { id: "short-service-near", a: { x: -W, y: -SS }, b: { x: W, y: -SS }, family: "across" },
  { id: "long-service-near", a: { x: -W, y: -LS }, b: { x: W, y: -LS }, family: "across" },
  { id: "baseline-near", a: { x: -W, y: -L }, b: { x: W, y: -L }, family: "across" },
  // along (baseline to baseline)
  { id: "sideline-doubles-left", a: { x: -W, y: -L }, b: { x: -W, y: L }, family: "along" },
  { id: "sideline-singles-left", a: { x: -S, y: -L }, b: { x: -S, y: L }, family: "along" },
  { id: "sideline-singles-right", a: { x: S, y: -L }, b: { x: S, y: L }, family: "along" },
  { id: "sideline-doubles-right", a: { x: W, y: -L }, b: { x: W, y: L }, family: "along" },
  { id: "centre-far", a: { x: 0, y: SS }, b: { x: 0, y: L }, family: "along" },
  { id: "centre-near", a: { x: 0, y: -L }, b: { x: 0, y: -SS }, family: "along" },
];

/** Outer doubles corners, ordered near-left, near-right, far-right, far-left. */
export const COURT_CORNERS: readonly Vec2[] = [
  { x: -W, y: -L },
  { x: W, y: -L },
  { x: W, y: L },
  { x: -W, y: L },
];

export type CourtFormat = "singles" | "doubles";

/** True when a floor point is inside the court, with an optional margin (m). */
export function insideCourt(p: Vec2, format: CourtFormat = "doubles", margin = 0): boolean {
  const halfW = format === "singles" ? S : W;
  return Math.abs(p.x) <= halfW + margin && Math.abs(p.y) <= L + margin;
}

/** Which half a floor point is on: −1 near (y < 0), +1 far. */
export const courtSide = (p: Vec2): -1 | 1 => (p.y < 0 ? -1 : 1);
