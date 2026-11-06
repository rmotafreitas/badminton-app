/**
 * <video> + canvas overlay kept in sync frame-by-frame. Used for in-app
 * playback of analysed sessions (and the lab's debug replay).
 *
 * Controls live in a bar *below* the picture: native controls would sit on
 * top of the overlay's bottom widgets (and iOS draws them above any canvas).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  /** Accessible names for the control bar. */
  controlLabels?: {
    play: string;
    pause: string;
    seek: string;
    fullscreen: string;
  };
}

const CONTROL_LABELS_EN = {
  play: "Play",
  pause: "Pause",
  seek: "Seek",
  fullscreen: "Full screen",
};

const clock = (s: number) => {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
};

export const OverlayPlayer = forwardRef<OverlayPlayerHandle, Props>(function OverlayPlayer(
  {
    src,
    result,
    names,
    theme = buddyTheme,
    labels = LABELS_EN,
    skin = DEFAULT_SKIN,
    className,
    onTime,
    controlLabels = CONTROL_LABELS_EN,
  },
  ref,
) {
  const videoRef = useRef<VideoWithRvfc>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(result.video.durationS || 0);
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
      const vp = {
        width: cw,
        height: ch,
        video: { x: (cw - w) / 2, y: (ch - h) / 2, w, h },
      };
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
    const sync = () => {
      setPlaying(!v.paused && !v.ended);
      setTime(v.currentTime);
      if (Number.isFinite(v.duration) && v.duration > 0) setDuration(v.duration);
    };
    const events = ["play", "pause", "ended", "timeupdate", "durationchange", "loadedmetadata"] as const;
    for (const e of events) v.addEventListener(e, sync);
    v.addEventListener("seeked", redraw);
    v.addEventListener("loadeddata", redraw);
    const ro = new ResizeObserver(redraw);
    ro.observe(v);
    return () => {
      if (handle && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle);
      cancelAnimationFrame(raf);
      for (const e of events) v.removeEventListener(e, sync);
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

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => {});
    else v.pause();
  };
  // Fullscreen on the wrapper keeps the overlay; iPhone Safari has no element
  // fullscreen (only the bare <video>), so the button is hidden there.
  const canFullscreen = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const fullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void boxRef.current?.requestFullscreen().catch(() => {});
  };

  return (
    <div ref={boxRef} className={`bg-black rounded-xl overflow-hidden flex flex-col ${className ?? ""}`}>
      <div className="relative flex-1 min-h-0">
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          onClick={toggle}
          className="w-full h-full object-contain block cursor-pointer"
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
      </div>
      <div className="flex items-center gap-3 px-3 py-2 text-white bg-black">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? controlLabels.pause : controlLabels.play}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/15"
        >
          <i aria-hidden className={`mdi ${playing ? "mdi-pause" : "mdi-play"} text-2xl`} />
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          aria-label={controlLabels.seek}
          onChange={(e) => {
            const v = videoRef.current;
            const t = Number(e.target.value);
            setTime(t);
            if (v) v.currentTime = t;
          }}
          className="flex-1 accent-lime-400 h-1.5"
        />
        <span className="text-xs tabular-nums text-white/80 whitespace-nowrap">
          {clock(time)} / {clock(duration)}
        </span>
        {canFullscreen && (
          <button
            type="button"
            onClick={fullscreen}
            aria-label={controlLabels.fullscreen}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/15"
          >
            <i aria-hidden className="mdi mdi-fullscreen text-2xl" />
          </button>
        )}
      </div>
    </div>
  );
});
