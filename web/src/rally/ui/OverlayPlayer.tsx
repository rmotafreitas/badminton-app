/**
 * <video> + canvas overlay kept in sync frame-by-frame. Used for in-app
 * playback of analysed sessions (and the lab's debug replay).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type { AnalysisResult, PlayerId } from "../engine/types";
import { DEFAULT_SKIN, renderOverlay, type OverlaySkin } from "../overlay/renderer";
import { frameState, prepareOverlay } from "../overlay/state";
import { buddyTheme, LABELS_EN, type OverlayLabels, type OverlayTheme } from "../overlay/theme";

export interface OverlayPlayerHandle {
  seek(t: number): void;
  currentTime(): number;
  video(): HTMLVideoElement | null;
}

interface Props {
  src: string;
  result: AnalysisResult;
  names?: Partial<Record<PlayerId, string>>;
  theme?: OverlayTheme;
  labels?: OverlayLabels;
  skin?: OverlaySkin;
  className?: string;
  onTime?: (t: number) => void;
}

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export const OverlayPlayer = forwardRef<OverlayPlayerHandle, Props>(function OverlayPlayer(
  { src, result, names, theme = buddyTheme, labels = LABELS_EN, skin = DEFAULT_SKIN, className, onTime },
  ref,
) {
  const videoRef = useRef<VideoWithRvfc>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prepared = useMemo(() => prepareOverlay(result, names), [result, names]);
  const onTimeRef = useRef(onTime);
  useEffect(() => {
    onTimeRef.current = onTime;
  });

  const draw = useCallback(
    (t: number) => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (!v || !c) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(v.clientWidth * dpr);
      const ch = Math.round(v.clientHeight * dpr);
      if (!cw || !ch) return;
      if (c.width !== cw || c.height !== ch) {
        c.width = cw;
        c.height = ch;
      }
      // object-fit: contain letterboxing.
      const ar = result.video.width / result.video.height;
      let w = cw;
      let h = cw / ar;
      if (h > ch) {
        h = ch;
        w = ch * ar;
      }
      const vp = { width: cw, height: ch, video: { x: (cw - w) / 2, y: (ch - h) / 2, w, h } };
      renderOverlay(c.getContext("2d")!, prepared, frameState(prepared, t), vp, theme, labels, skin);
      onTimeRef.current?.(t);
    },
    [prepared, result.video.width, result.video.height, theme, labels, skin],
  );

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let handle = 0;
    let raf = 0;
    const tick = (_: number, meta?: { mediaTime: number }) => {
      draw(meta?.mediaTime ?? v.currentTime);
      handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(tick) : 0;
    };
    if (v.requestVideoFrameCallback) {
      handle = v.requestVideoFrameCallback(tick);
    } else {
      const loop = () => {
        draw(v.currentTime);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    const redraw = () => draw(v.currentTime);
    v.addEventListener("seeked", redraw);
    v.addEventListener("loadeddata", redraw);
    const ro = new ResizeObserver(redraw);
    ro.observe(v);
    return () => {
      if (handle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      v.removeEventListener("seeked", redraw);
      v.removeEventListener("loadeddata", redraw);
      ro.disconnect();
    };
  }, [draw]);

  useImperativeHandle(ref, () => ({
    seek: (t) => {
      if (videoRef.current) videoRef.current.currentTime = t;
    },
    currentTime: () => videoRef.current?.currentTime ?? 0,
    video: () => videoRef.current,
  }));

  return (
    <div className={`relative bg-black rounded-xl overflow-hidden ${className ?? ""}`}>
      <video ref={videoRef} src={src} controls playsInline className="w-full h-full object-contain block" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
});
