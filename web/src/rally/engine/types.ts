/**
 * Analysis result schema — the single contract between the analysis engine,
 * the overlay renderer (live, playback, export), the review UI and the
 * backend. Versioned: bump ANALYSIS_VERSION on breaking changes.
 *
 * Units: metres, seconds, km/h for speeds shown to people. Court frame as in
 * geometry/court.ts (net at y = 0, near half y < 0).
 */
import type { Mat3, Vec2, Vec3 } from "./geometry/linalg";

export const ANALYSIS_VERSION = 1;

export type PlayerId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
export type SessionFormat = "singles" | "doubles" | "practice";
export type ShotType =
  | "serve"
  | "clear"
  | "smash"
  | "drop"
  | "drive"
  | "lift"
  | "net"
  | "other";
export type Confidence = "high" | "medium" | "low";

export interface Calibration {
  /** Doubles court corners in image px: near-left, near-right, far-right, far-left. */
  corners: [Vec2, Vec2, Vec2, Vec2];
  /** World floor (m) → image (px). */
  H: Mat3;
  focal: number;
  cameraCentre: Vec3;
  /** 0–1: how well the court model fits the image lines. */
  score: number;
  source: "auto" | "manual";
}

export interface PlayerInfo {
  id: PlayerId;
  /** −1 near half, +1 far half (at the start of the session). */
  side: -1 | 1;
  /** Linked app user, set by the owner at any time. */
  userId?: string;
}

/** One player's track, sampled at `TRACK_HZ`. */
export interface PlayerTrack {
  id: PlayerId;
  /** Start time of sample 0 (s). */
  t0: number;
  /** Court x,y (m), interleaved [x0, y0, x1, y1, …]; NaN when unknown. */
  court: number[];
  /** Image box [x1, y1, x2, y2] per sample (px), interleaved; NaN when unknown. */
  boxes: number[];
}

export const TRACK_HZ = 10;

export interface ShuttleSample {
  t: number;
  /** Image px. */
  x: number;
  y: number;
  conf: number;
}

export interface Shot {
  id: string;
  rallyId: string;
  /** Time of contact (s). */
  t: number;
  hitter: PlayerId | null;
  type: ShotType;
  typeConfidence: Confidence;
  /** Launch speed (km/h) from the physics fit. */
  speedKmh: number | null;
  /** Hitter-to-next-contact average speed (km/h). */
  avgSpeedKmh: number | null;
  speedConfidence: Confidence;
  contactHeight: number | null;
  apexHeight: number | null;
  flightTime: number | null;
  landing: Vec2 | null;
  /** Set when a person confirmed or corrected this shot. */
  reviewed?: boolean;
  /** Soft-deleted by a correction (false hit). */
  deleted?: boolean;
}

export interface Rally {
  id: string;
  start: number;
  end: number;
  shotIds: string[];
}

export interface PlayerStats {
  id: PlayerId;
  distanceM: number;
  shots: number;
  shotsByType: Partial<Record<ShotType, number>>;
  maxSpeedKmh: number | null;
  avgSpeedKmh: number | null;
  /** Court heatmap: 6×13 grid (x, y cells over the player's half), counts. */
  heatmap: number[];
}

export interface SessionStats {
  rallies: number;
  shots: number;
  avgRallyShots: number;
  longestRallyShots: number;
  players: PlayerStats[];
}

export interface AnalysisResult {
  version: typeof ANALYSIS_VERSION;
  createdAt: string;
  engine: { runtime: string; backend: string; models: string[] };
  video: { width: number; height: number; fps: number; durationS: number; analysedFps: number };
  format: SessionFormat;
  calibration: Calibration | null;
  players: PlayerInfo[];
  tracks: PlayerTrack[];
  shuttle: ShuttleSample[];
  rallies: Rally[];
  shots: Shot[];
  stats: SessionStats;
}

/** Person corrections, stored separately so re-analysis can re-apply them. */
export interface Corrections {
  shots?: Record<string, Partial<Pick<Shot, "type" | "hitter" | "deleted">>>;
  /** Swap labels from a time onwards, e.g. after an ID switch: [t, a, b]. */
  swaps?: [number, PlayerId, PlayerId][];
  players?: Partial<Record<PlayerId, { userId?: string | null }>>;
  format?: SessionFormat;
  calibration?: Calibration["corners"];
}
