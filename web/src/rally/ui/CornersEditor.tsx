/**
 * Drag the 4 outer court corners over a video frame. Handles may sit outside
 * the picture (the near corners often are), so the editor pads the frame.
 * Court lines are drawn live from the homography so the fit is obvious.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useDictionary } from "@/i18n";
import { COURT_CORNERS, COURT_LINES } from "../engine/geometry/court";
import { estimateHomography } from "../engine/geometry/homography";
import { applyH, type Vec2 } from "../engine/geometry/linalg";
import type { Calibration } from "../engine/types";

interface Props {
  /** Video frame to align against. */
  frame: CanvasImageSource & { width: number; height: number };
  /** Source video size (corners are in source px). */
  width: number;
  height: number;
  initial?: Calibration["corners"] | null;
  onDone: (corners: Calibration["corners"]) => void;
  onCancel?: () => void;
  doneLabel?: string;
}

const LABELS = ["NL", "NR", "FR", "FL"];

function defaultCorners(w: number, h: number): Calibration["corners"] {
  // A typical behind-the-baseline view.
  return [
    { x: w * 0.05, y: h * 0.95 },
    { x: w * 0.95, y: h * 0.95 },
    { x: w * 0.7, y: h * 0.45 },
    { x: w * 0.3, y: h * 0.45 },
  ];
}

export function CornersEditor({ frame, width, height, initial, onDone, onCancel, doneLabel }: Props) {
  const t = useDictionary().rally.corners;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [corners, setCorners] = useState<Calibration["corners"]>(initial ?? defaultCorners(width, height));
  const drag = useRef<number | null>(null);
  // Padding around the frame so off-screen corners stay reachable.
  const pad = 0.25;
  const view = useMemo(
    () => ({ x0: -width * pad, y0: -height * pad, w: width * (1 + 2 * pad), h: height * (1 + 2 * pad) }),
    [width, height],
  );

  // Redraw when the canvas gets/changes its layout size (first paint can
  // happen before layout, leaving a 0-wide canvas).
  const [layoutW, setLayoutW] = useState(0);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(([e]) => setLayoutW(Math.round(e!.contentRect.width)));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !layoutW) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = layoutW * dpr;
    const ch = (cw * view.h) / view.w;
    c.width = cw;
    c.height = ch;
    const s = cw / view.w;
    // CPU-backed: one still frame, and some browsers (headless/GPU) don't
    // present GPU canvases drawn from ImageBitmaps until a readback.
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(frame, -view.x0 * s, -view.y0 * s, width * s, height * s);
    const H = estimateHomography(COURT_CORNERS, corners);
    const P = (p: Vec2) => ({ x: (p.x - view.x0) * s, y: (p.y - view.y0) * s });
    if (H) {
      ctx.strokeStyle = "rgba(244,63,94,0.9)";
      ctx.lineWidth = 2 * dpr;
      for (const l of COURT_LINES) {
        const pts: Vec2[] = [];
        for (let u = 0; u <= 1.0001; u += 0.05) {
          const q = applyH(H, { x: l.a.x + u * (l.b.x - l.a.x), y: l.a.y + u * (l.b.y - l.a.y) });
          if (q) pts.push(P(q));
        }
        ctx.beginPath();
        pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
        ctx.stroke();
      }
    }
    corners.forEach((p, i) => {
      const q = P(p);
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(q.x, q.y, 9 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#111";
      ctx.font = `700 ${9 * dpr}px Inter, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(LABELS[i]!, q.x, q.y);
    });
  }, [corners, frame, width, height, view, layoutW]);

  const toSource = (e: React.PointerEvent): Vec2 => {
    const r = canvasRef.current!.getBoundingClientRect();
    return {
      x: view.x0 + ((e.clientX - r.left) / r.width) * view.w,
      y: view.y0 + ((e.clientY - r.top) / r.height) * view.h,
    };
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{t.hint}</p>
      <canvas
        ref={canvasRef}
        className="block w-full rounded-lg touch-none select-none cursor-crosshair"
        style={{ aspectRatio: `${view.w} / ${view.h}` }}
        onPointerDown={(e) => {
          const p = toSource(e);
          let best = -1;
          let bd = Infinity;
          corners.forEach((c, i) => {
            const d = Math.hypot(c.x - p.x, c.y - p.y);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          // Grab radius ~6 % of the view width.
          if (bd < view.w * 0.06) {
            drag.current = best;
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return;
          const p = toSource(e);
          setCorners((cs) => cs.map((c, i) => (i === drag.current ? p : c)) as Calibration["corners"]);
        }}
        onPointerUp={() => (drag.current = null)}
      />
      <div className="flex gap-2 justify-end">
        <button className="button" onClick={() => setCorners(defaultCorners(width, height))}>
          {t.reset}
        </button>
        {onCancel && (
          <button className="button" onClick={onCancel}>
            ✕
          </button>
        )}
        <button className="button green" onClick={() => onDone(corners)}>
          {doneLabel ?? t.done}
        </button>
      </div>
    </div>
  );
}
