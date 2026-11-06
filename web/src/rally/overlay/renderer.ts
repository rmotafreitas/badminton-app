/**
 * Canvas overlay renderer shared by live preview, in-app playback and video
 * export. A skin is a list of widgets; each widget is a small function that
 * draws one thing from the frame state using the theme's tokens.
 */
import { COURT, COURT_LINES } from "../engine/geometry/court";
import { applyH, type Mat3, type Vec2 } from "../engine/geometry/linalg";
import type { PlayerId } from "../engine/types";
import type { FrameState, PreparedOverlay } from "./state";
import type { OverlayLabels, OverlayTheme } from "./theme";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface Viewport {
  /** Canvas size in device px. */
  width: number;
  height: number;
  /** Where the video is drawn inside the canvas (letterboxing), device px. */
  video: { x: number; y: number; w: number; h: number };
}

export interface DrawEnv {
  ctx: Ctx2D;
  theme: OverlayTheme;
  labels: OverlayLabels;
  state: FrameState;
  prepared: PreparedOverlay;
  vp: Viewport;
  /** Layout unit: 1 % of the shorter canvas side × theme scale. */
  u: number;
  /** Source video px → canvas px. */
  toCanvas: (p: Vec2) => Vec2;
  /** Court floor (m) → source video px, if calibrated. */
  courtH: Mat3 | null;
}

export type Widget = (env: DrawEnv) => void;

export interface OverlaySkin {
  id: string;
  /** Drawn in video space (follow the action). */
  scene: Widget[];
  /** Heads-up panels in screen space. */
  hud: Widget[];
}

// ── helpers ─────────────────────────────────────────────────────────────────

function panel(env: DrawEnv, x: number, y: number, w: number, h: number) {
  const { ctx, theme, u } = env;
  ctx.save();
  ctx.fillStyle = theme.panelBg;
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = Math.max(1, u * 0.15);
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, theme.radius * u);
  ctx.fill();
  if (theme.panelBorder !== "transparent") ctx.stroke();
  ctx.restore();
}

function text(
  env: DrawEnv,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  opts: { weight?: number; align?: CanvasTextAlign; display?: boolean; baseline?: CanvasTextBaseline } = {},
) {
  const { ctx, theme, u } = env;
  ctx.font = `${opts.weight ?? 600} ${size * u}px ${opts.display ? theme.displayFont : theme.fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = opts.align ?? "left";
  ctx.textBaseline = opts.baseline ?? "alphabetic";
  ctx.fillText(s, x, y);
}

const approx = (v: number | null | undefined, unit = "") => (v === null || v === undefined ? "—" : `~${Math.round(v)}${unit}`);

const playerColor = (env: DrawEnv, id: PlayerId) => env.theme.players[id] ?? env.theme.text;

// ── scene widgets ────────────────────────────────────────────────────────────

export const groundRings: Widget = (env) => {
  if (!env.courtH) return;
  const { ctx, u } = env;
  for (const p of env.state.players) {
    if (!p.court || !p.box) continue;
    const pts: Vec2[] = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 18) {
      const img = applyH(env.courtH, { x: p.court.x + 0.42 * Math.cos(a), y: p.court.y + 0.42 * Math.sin(a) });
      if (img) pts.push(env.toCanvas(img));
    }
    if (pts.length < 8) continue;
    ctx.save();
    ctx.strokeStyle = playerColor(env, p.id);
    ctx.lineWidth = Math.max(1.5, u * 0.35);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.stroke();
    ctx.restore();
  }
};

export const playerTags: Widget = (env) => {
  const { ctx, u } = env;
  for (const p of env.state.players) {
    if (!p.box) continue;
    const top = env.toCanvas({ x: (p.box[0] + p.box[2]) / 2, y: p.box[1] });
    const label = p.name;
    ctx.font = `700 ${2.6 * u}px ${env.theme.fontFamily}`;
    const w = ctx.measureText(label).width + 2.6 * u;
    const h = 3.8 * u;
    const x = top.x - w / 2;
    const y = top.y - h - 1.2 * u;
    panel(env, x, y, w, h);
    ctx.fillStyle = playerColor(env, p.id);
    ctx.fillRect(x + 0.7 * u, y + 0.8 * u, 0.45 * u, h - 1.6 * u);
    text(env, label, x + 1.6 * u, y + h / 2 + 0.1 * u, 2.6, env.theme.text, { weight: 700, baseline: "middle" });
  }
};

export const shuttleTrail: Widget = (env) => {
  const { ctx, state, u } = env;
  const n = state.trail.length;
  state.trail.forEach((s, i) => {
    const p = env.toCanvas(s);
    ctx.save();
    ctx.globalAlpha = 0.15 + 0.85 * ((i + 1) / n);
    ctx.fillStyle = env.theme.shuttle;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1.5, u * (i === n - 1 ? 0.75 : 0.45)), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
};

// ── HUD widgets ──────────────────────────────────────────────────────────────

const M = 2.5; // margin in units

export const speedCard: Widget = (env) => {
  const { u, labels, theme, state } = env;
  const x = M * u;
  const y = M * u;
  const w = 30 * u;
  const h = 13 * u;
  panel(env, x, y, w, h);
  env.ctx.fillStyle = theme.accent;
  env.ctx.fillRect(x + 1.6 * u, y + 1.8 * u, 0.4 * u, 2.4 * u);
  text(env, labels.speed, x + 2.6 * u, y + 3.9 * u, 1.9, theme.text, { weight: 700 });
  text(env, approx(state.speedKmh), x + 1.6 * u, y + 9.6 * u, 6.2, theme.text, { weight: 800, display: true });
  text(env, "km/h", x + w - 1.8 * u, y + 9.4 * u, 2.2, theme.accent, { weight: 700, align: "right" });
  text(env, labels.speedNote, x + 1.6 * u, y + 11.8 * u, 1.4, theme.muted, { weight: 500 });
};

export const shotCountCard: Widget = (env) => {
  const { u, labels, theme, state, vp } = env;
  const w = 18 * u;
  const h = 13 * u;
  const x = vp.width - w - M * u;
  const y = M * u;
  panel(env, x, y, w, h);
  text(env, state.rallyOver ? labels.rallyTotal : labels.shots, x + 1.6 * u, y + 3.9 * u, 1.9, theme.text, {
    weight: 700,
  });
  text(env, String(state.shotCount).padStart(2, "0"), x + 1.6 * u, y + 10.2 * u, 6.2, theme.text, {
    weight: 800,
    display: true,
  });
};

export const shotLabel: Widget = (env) => {
  const { u, labels, theme, state, ctx } = env;
  const s = state.lastShot;
  if (!s || state.shotAge > 1.6 || state.rallyOver) return;
  const fade = state.shotAge < 1.2 ? 1 : 1 - (state.shotAge - 1.2) / 0.4;
  const x = M * u;
  const y = (M + 14.5) * u;
  const title = labels.shotTypes[s.type];
  ctx.save();
  ctx.globalAlpha = Math.max(0, fade);
  ctx.font = `800 ${4.4 * u}px ${theme.displayFont}`;
  const w = Math.max(20 * u, ctx.measureText(title).width + 3.6 * u);
  panel(env, x, y, w, 8.4 * u);
  text(env, title, x + 1.6 * u, y + 5 * u, 4.4, theme.shotTypes[s.type], { weight: 800, display: true });
  const who = s.hitter ? (env.prepared.names[s.hitter] ?? s.hitter) : "—";
  text(env, `${who} · ${labels.shot} ${state.shotIndex}`, x + 1.6 * u, y + 7.3 * u, 1.5, theme.muted, { weight: 600 });
  ctx.restore();
};

export const distancePanel: Widget = (env) => {
  const { u, labels, theme, state, vp } = env;
  const rows = state.players;
  if (!rows.length) return;
  const w = 30 * u;
  const h = (6.2 + rows.length * 3.4) * u;
  const x = M * u;
  const y = vp.height - h - M * u - 2.4 * u;
  panel(env, x, y, w, h);
  text(env, labels.distance, x + 1.6 * u, y + 3.6 * u, 1.9, theme.text, { weight: 700 });
  rows.forEach((p, i) => {
    const ry = y + (6.6 + i * 3.4) * u;
    env.ctx.fillStyle = playerColor(env, p.id);
    env.ctx.beginPath();
    env.ctx.arc(x + 2.2 * u, ry - 0.6 * u, 0.6 * u, 0, Math.PI * 2);
    env.ctx.fill();
    text(env, p.name, x + 3.6 * u, ry, 1.9, theme.text, { weight: 600 });
    text(env, `${approx(p.distanceM)} m`, x + w - 1.6 * u, ry, 2.4, playerColor(env, p.id), {
      weight: 800,
      align: "right",
    });
  });
};

export const courtMap: Widget = (env) => {
  const { u, labels, theme, state, vp, ctx } = env;
  const mapH = 26 * u;
  const mapW = mapH * (COURT.doublesWidth / COURT.length);
  const w = mapW + 3.2 * u;
  const h = mapH + 6 * u;
  const x = vp.width - w - M * u;
  const y = vp.height - h - M * u - 2.4 * u;
  panel(env, x, y, w, h);
  text(env, labels.courtMap, x + 1.6 * u, y + 3.2 * u, 1.6, theme.text, { weight: 700 });
  const ox = x + 1.6 * u;
  const oy = y + 4.4 * u;
  // Court frame: near half (y<0) at the bottom of the map, as the camera sees it.
  const map = (p: Vec2): Vec2 => ({
    x: ox + ((p.x + COURT.halfDoublesWidth) / COURT.doublesWidth) * mapW,
    y: oy + ((COURT.halfLength - p.y) / COURT.length) * mapH,
  });
  ctx.save();
  ctx.fillStyle = theme.courtFill;
  ctx.fillRect(ox, oy, mapW, mapH);
  ctx.strokeStyle = theme.courtLine;
  ctx.lineWidth = Math.max(1, u * 0.18);
  for (const l of COURT_LINES) {
    const a = map(l.a);
    const b = map(l.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.setLineDash([u * 0.6, u * 0.4]);
  const n1 = map({ x: -COURT.halfDoublesWidth, y: 0 });
  const n2 = map({ x: COURT.halfDoublesWidth, y: 0 });
  ctx.beginPath();
  ctx.moveTo(n1.x, n1.y);
  ctx.lineTo(n2.x, n2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  if (state.landing && state.shotAge < 2.5) {
    const l = map(state.landing);
    ctx.strokeStyle = theme.shuttle;
    ctx.lineWidth = Math.max(1, u * 0.3);
    const r = u * 0.8;
    ctx.beginPath();
    ctx.moveTo(l.x - r, l.y - r);
    ctx.lineTo(l.x + r, l.y + r);
    ctx.moveTo(l.x + r, l.y - r);
    ctx.lineTo(l.x - r, l.y + r);
    ctx.stroke();
  }
  for (const p of state.players) {
    if (!p.court) continue;
    const q = map(p.court);
    ctx.fillStyle = playerColor(env, p.id);
    ctx.beginPath();
    ctx.arc(q.x, q.y, u * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const footer: Widget = (env) => {
  const { u, labels, theme, vp } = env;
  text(env, labels.footer, M * u, vp.height - M * u * 0.6, 1.3, theme.muted, { weight: 600 });
};

export const DEFAULT_SKIN: OverlaySkin = {
  id: "default",
  scene: [groundRings, shuttleTrail, playerTags],
  hud: [speedCard, shotCountCard, shotLabel, distancePanel, courtMap, footer],
};

/** Scene-only skin for live preview / clean exports. */
export const MINIMAL_SKIN: OverlaySkin = {
  id: "minimal",
  scene: [groundRings, shuttleTrail, playerTags],
  hud: [courtMap],
};

export function renderOverlay(
  ctx: Ctx2D,
  prepared: PreparedOverlay,
  state: FrameState,
  vp: Viewport,
  theme: OverlayTheme,
  labels: OverlayLabels,
  skin: OverlaySkin = DEFAULT_SKIN,
) {
  const r = prepared.result;
  const sx = vp.video.w / r.video.width;
  const sy = vp.video.h / r.video.height;
  const env: DrawEnv = {
    ctx,
    theme,
    labels,
    state,
    prepared,
    vp,
    u: (Math.min(vp.width, vp.height) / 100) * theme.scale,
    toCanvas: (p) => ({ x: vp.video.x + p.x * sx, y: vp.video.y + p.y * sy }),
    courtH: r.calibration?.H ?? null,
  };
  ctx.clearRect(0, 0, vp.width, vp.height);
  for (const w of skin.scene) w(env);
  for (const w of skin.hud) w(env);
}
