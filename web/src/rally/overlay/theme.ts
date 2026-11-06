/**
 * Overlay look & feel. A theme is pure data (tokens); the skin decides which
 * widgets appear where. Restyling = editing a theme object, no drawing code.
 */
import type { PlayerId, ShotType } from "../engine/types";

export interface OverlayTheme {
  id: string;
  fontFamily: string;
  /** Bold display font for big numbers / shot labels. */
  displayFont: string;
  panelBg: string;
  panelBorder: string;
  text: string;
  muted: string;
  accent: string;
  radius: number;
  players: Record<PlayerId, string>;
  shotTypes: Record<ShotType, string>;
  shuttle: string;
  courtLine: string;
  courtFill: string;
  /** Overall size multiplier. */
  scale: number;
}

const PLAYERS: Record<PlayerId, string> = {
  P1: "#a3e635",
  P2: "#5eead4",
  P3: "#c4b5fd",
  P4: "#f9a8d4",
  P5: "#fdba74",
  P6: "#93c5fd",
};

const SHOT_TYPES: Record<ShotType, string> = {
  serve: "#c4b5fd",
  clear: "#f9a8d4",
  smash: "#facc15",
  drop: "#5eead4",
  drive: "#a5b4fc",
  lift: "#a3e635",
  net: "#fdba74",
  other: "#e2e8f0",
};

/** Badminton Buddy brand: app green accent, Inter. */
export const buddyTheme: OverlayTheme = {
  id: "buddy",
  fontFamily: '"Inter", "Poppins", system-ui, sans-serif',
  displayFont: '"Inter", "Poppins", system-ui, sans-serif',
  panelBg: "rgba(10, 18, 16, 0.78)",
  panelBorder: "rgba(255, 255, 255, 0.10)",
  text: "#ffffff",
  muted: "rgba(255, 255, 255, 0.62)",
  accent: "hsl(150, 65%, 45%)",
  radius: 1.4,
  players: PLAYERS,
  shotTypes: SHOT_TYPES,
  shuttle: "#ffffff",
  courtLine: "rgba(255, 255, 255, 0.55)",
  courtFill: "rgba(18, 52, 40, 0.85)",
  scale: 1,
};

/** Minimal, high-contrast variant (bright gyms, small screens). */
export const minimalTheme: OverlayTheme = {
  ...buddyTheme,
  id: "minimal",
  panelBg: "rgba(0, 0, 0, 0.55)",
  panelBorder: "transparent",
  accent: "#ffffff",
  radius: 0.6,
};

export const THEMES: Record<string, OverlayTheme> = { buddy: buddyTheme, minimal: minimalTheme };

export interface OverlayLabels {
  speed: string;
  speedNote: string;
  shots: string;
  rallyTotal: string;
  distance: string;
  courtMap: string;
  shot: string;
  footer: string;
  shotTypes: Record<ShotType, string>;
}

export const LABELS_EN: OverlayLabels = {
  speed: "SHUTTLE SPEED",
  speedNote: "LAUNCH · ESTIMATE",
  shots: "SHOTS",
  rallyTotal: "RALLY TOTAL",
  distance: "DISTANCE COVERED",
  courtMap: "COURT MAP",
  shot: "SHOT",
  footer: "APPROXIMATE VALUES · BADMINTON BUDDY",
  shotTypes: {
    serve: "SERVE",
    clear: "CLEAR",
    smash: "SMASH",
    drop: "DROP",
    drive: "DRIVE",
    lift: "LIFT",
    net: "NET SHOT",
    other: "SHOT",
  },
};

export const LABELS_PT: OverlayLabels = {
  speed: "VELOCIDADE DO VOLANTE",
  speedNote: "SAÍDA · ESTIMATIVA",
  shots: "PANCADAS",
  rallyTotal: "TOTAL DO PONTO",
  distance: "DISTÂNCIA PERCORRIDA",
  courtMap: "MAPA DO CAMPO",
  shot: "PANCADA",
  footer: "VALORES APROXIMADOS · BADMINTON BUDDY",
  shotTypes: {
    serve: "SERVIÇO",
    clear: "CLEAR",
    smash: "SMASH",
    drop: "AMORTI",
    drive: "DRIVE",
    lift: "LIFT",
    net: "REDE",
    other: "PANCADA",
  },
};
