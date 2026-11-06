/**
 * /analysis/record — one tap to record. Live overlay (court fit, players,
 * mini map) and a setup check before you start; analysis runs later.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDictionary, useLanguage } from "@/i18n";
import { cameraFromHomography } from "../engine/geometry/camera";
import { COURT_CORNERS } from "../engine/geometry/court";
import { estimateHomography } from "../engine/geometry/homography";
import { applyH, mat3Inv, type Mat3, type Vec2 } from "../engine/geometry/linalg";
import type { LiveCheck, LiveRequest, LiveResponse } from "../engine/live/live.worker";
import type { Box } from "../engine/models/yolox";
import type { AnalysisResult, Calibration, PlayerId } from "../engine/types";
import { LIVE_SKIN, renderOverlay } from "../overlay/renderer";
import type { FrameState, PreparedOverlay } from "../overlay/state";
import { buddyTheme, LABELS_EN, LABELS_PT } from "../overlay/theme";
import { CornersEditor } from "./CornersEditor";
import { useSessionManager } from "./hooks";

const LIVE_LONG = 480; // must match live.worker SAMPLE_LONG

function pickMime(): string | undefined {
  const prefs = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  if (typeof MediaRecorder === "undefined") return undefined;
  return prefs.find((m) => MediaRecorder.isTypeSupported(m));
}

type Level = "ok" | "warn" | "bad" | "unknown";

function CheckRow({ level, text }: { level: Level; text: string }) {
  const icon = { ok: "mdi-check-circle text-emerald-400", warn: "mdi-alert text-amber-400", bad: "mdi-close-circle text-red-400", unknown: "mdi-help-circle text-gray-400" }[level];
  return (
    <li className="flex items-center gap-2">
      <i className={`mdi ${icon}`} />
      <span>{text}</span>
    </li>
  );
}

export default function RecordPage() {
  const t = useDictionary().rally;
  const { lang } = useLanguage();
  const navigate = useNavigate();
  const manager = useSessionManager();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const busy = useRef(false);
  const boxesRef = useRef<{ boxes: Box[]; w: number; h: number }>({ boxes: [], w: 1, h: 1 });
  const distRef = useRef<Map<PlayerId, { last: Vec2 | null; d: number }>>(new Map());

  const [status, setStatus] = useState<"starting" | "ready" | "denied" | "unsupported">("starting");
  const [recording, setRecording] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [videoSize, setVideoSize] = useState<{ w: number; h: number } | null>(null);
  const [check, setCheck] = useState<LiveCheck | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [manual, setManual] = useState<Calibration["corners"] | null>(null);
  const [editFrame, setEditFrame] = useState<HTMLCanvasElement | null>(null);
  const [players, setPlayers] = useState(0);

  // Corners in full video px: manual beats auto.
  const cornersRef = useRef<Calibration["corners"] | null>(null);
  const autoCorners = (() => {
    if (!check?.corners || !videoSize) return null;
    const s = Math.max(videoSize.w, videoSize.h) / LIVE_LONG;
    return check.corners.map((p) => ({ x: p.x * s, y: p.y * s })) as Calibration["corners"];
  })();
  const corners = manual ?? autoCorners;
  useEffect(() => {
    cornersRef.current = corners;
  }, [corners]);

  const H: Mat3 | null = corners ? estimateHomography(COURT_CORNERS, corners) : null;
  const camHeight =
    H && videoSize ? (cameraFromHomography(H, videoSize.w, videoSize.h)?.centre[2] ?? null) : null;

  // ── camera + worker ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !pickMime()) {
        setStatus("unsupported");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        streamRef.current = stream;
        const settings = stream.getVideoTracks()[0]?.getSettings();
        setFps(settings?.frameRate ? Math.round(settings.frameRate) : null);
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        setVideoSize({ w: v.videoWidth, h: v.videoHeight });
        setStatus("ready");
      } catch {
        setStatus("denied");
      }
    };
    void start();

    const w = new Worker(new URL("../engine/live/live.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<LiveResponse>) => {
      const m = e.data;
      if (m.type === "boxes") {
        boxesRef.current = { boxes: m.boxes, w: m.width, h: m.height };
        busy.current = false;
      } else if (m.type === "check") {
        setCheck(m.check);
      } else if (m.type === "error") {
        busy.current = false;
      }
    };
    w.postMessage({ type: "init" } satisfies LiveRequest);
    return () => {
      cancelled = true;
      w.terminate();
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  // ── frame pump (detections) + court check cadence ───────────────────────
  useEffect(() => {
    if (status !== "ready") return;
    let raf = 0;
    let lastSample = 0;
    const loop = async () => {
      const v = videoRef.current;
      const w = workerRef.current;
      if (v && w && !busy.current && v.readyState >= 2) {
        busy.current = true;
        const t = performance.now();
        const sample = t - lastSample > 600;
        if (sample) lastSample = t;
        try {
          const bmp = await createImageBitmap(v);
          w.postMessage({ type: "frame", bitmap: bmp, sample } satisfies LiveRequest, [bmp]);
        } catch {
          busy.current = false;
        }
      }
      raf = requestAnimationFrame(() => void loop());
    };
    raf = requestAnimationFrame(() => void loop());
    // Court check: often until found, then occasionally (phone might move).
    const tick = setInterval(() => workerRef.current?.postMessage({ type: "detect-court" } satisfies LiveRequest), 3000);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(tick);
    };
  }, [status]);

  // ── overlay drawing ──────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || !v.videoWidth) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(c.clientWidth * dpr);
    const ch = Math.round(c.clientHeight * dpr);
    if (c.width !== cw || c.height !== ch) {
      c.width = cw;
      c.height = ch;
    }
    const ar = v.videoWidth / v.videoHeight;
    let w = cw;
    let h = cw / ar;
    if (h > ch) {
      h = ch;
      w = ch * ar;
    }
    const cs = cornersRef.current;
    const Hm = cs ? estimateHomography(COURT_CORNERS, cs) : null;
    const Hinv = Hm ? mat3Inv(Hm) : null;
    const { boxes, w: bw } = boxesRef.current;
    const k = v.videoWidth / bw;
    // Label people on court by half and left→right (preview only).
    const onCourt = boxes
      .map((b) => {
        const box: [number, number, number, number] = [b.x1 * k, b.y1 * k, b.x2 * k, b.y2 * k];
        const court = Hinv ? applyH(Hinv, { x: (box[0] + box[2]) / 2, y: box[3] }) : null;
        return { box, court };
      })
      .filter((p) => !Hinv || (p.court && Math.abs(p.court.x) < 4.3 && Math.abs(p.court.y) < 8.2));
    const near = onCourt.filter((p) => (p.court?.y ?? 0) < 0).sort((a, b) => (a.court?.x ?? 0) - (b.court?.x ?? 0));
    const far = onCourt.filter((p) => (p.court?.y ?? 0) >= 0).sort((a, b) => (a.court?.x ?? 0) - (b.court?.x ?? 0));
    const ids: PlayerId[] = ["P1", "P2", "P3", "P4", "P5", "P6"];
    const labelled = [...near, ...far].slice(0, 6).map((p, i) => ({ ...p, id: ids[i]! }));
    for (const p of labelled) {
      if (!p.court) continue;
      const rec = distRef.current.get(p.id) ?? { last: null, d: 0 };
      if (rec.last) {
        const step = Math.hypot(p.court.x - rec.last.x, p.court.y - rec.last.y);
        if (step > 0.05 && step < 1.5) rec.d += step;
      }
      rec.last = p.court;
      distRef.current.set(p.id, rec);
    }
    if (labelled.length !== players) setPlayers(labelled.length);
    const prepared = {
      result: { video: { width: v.videoWidth, height: v.videoHeight }, calibration: Hm ? { H: Hm } : null } as unknown as AnalysisResult,
      cumDistance: new Map(),
      shots: [],
      names: {},
    } as PreparedOverlay;
    const state: FrameState = {
      t: 0,
      players: labelled.map((p) => ({
        id: p.id,
        name: p.id,
        box: p.box,
        court: p.court,
        distanceM: recording ? (distRef.current.get(p.id)?.d ?? 0) : 0,
      })),
      trail: [],
      lastShot: null,
      shotAge: Infinity,
      shotIndex: 0,
      shotCount: 0,
      rallyOver: false,
      speedKmh: null,
      landing: null,
    };
    const skin = recording || Hm ? LIVE_SKIN : { ...LIVE_SKIN, hud: [] };
    renderOverlay(
      c.getContext("2d")!,
      prepared,
      state,
      { width: cw, height: ch, video: { x: (cw - w) / 2, y: (ch - h) / 2, w, h } },
      buddyTheme,
      lang === "pt-PT" ? LABELS_PT : LABELS_EN,
      skin,
    );
  }, [lang, players, recording]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [recording]);

  // ── recording ────────────────────────────────────────────────────────────
  const startRecording = () => {
    const stream = streamRef.current;
    const mime = pickMime();
    if (!stream || !mime) return;
    chunks.current = [];
    distRef.current.clear();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5_000_000 });
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks.current, { type: mime.split(";")[0] });
      const id = await manager.addVideo(blob, {
        source: "camera",
        recordedAt: new Date(startedAt ?? Date.now()),
        corners: manual ?? undefined,
        autoAnalyse: false,
      });
      navigate(`/analysis/${id}`);
    };
    rec.start(1000);
    recRef.current = rec;
    setStartedAt(Date.now());
    setRecording(true);
  };

  const stopRecording = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  const openEditor = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    setEditFrame(c);
  };

  // ── setup check summary ──────────────────────────────────────────────────
  const ck = t.recorder.check;
  const court: Level = manual ? "ok" : check ? (check.corners ? (check.courtScore >= 0.7 ? "ok" : "warn") : "bad") : "unknown";
  const playersL: Level = players > 0 ? "ok" : check ? "warn" : "unknown";
  const stable: Level = check ? (check.stability > 0.75 ? "ok" : check.stability > 0.45 ? "warn" : "bad") : "unknown";
  const lightL: Level = check ? (check.light > 70 ? "ok" : check.light > 40 ? "warn" : "bad") : "unknown";
  const fpsL: Level = fps === null ? "unknown" : fps >= 50 ? "ok" : "warn";
  const heightL: Level = camHeight === null ? "unknown" : camHeight >= 1.9 ? "ok" : "warn";
  const levels = [court, playersL, stable, lightL, fpsL, heightL];
  const overall = levels.includes("bad") ? "poor" : levels.filter((l) => l === "warn").length >= 2 ? "fair" : levels.every((l) => l === "ok") ? "good" : "fair";
  const portrait = !!videoSize && videoSize.h > videoSize.w;
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;

  return (
    <div className="fixed inset-0 z-40 bg-black text-white flex flex-col" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-contain" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

        {editFrame && (
          <div className="absolute inset-0 bg-black/90 overflow-auto p-4">
            <CornersEditor
              frame={editFrame}
              width={editFrame.width}
              height={editFrame.height}
              initial={corners}
              onCancel={() => setEditFrame(null)}
              onDone={(c) => {
                setManual(c);
                setEditFrame(null);
              }}
            />
          </div>
        )}

        {status !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-3">
              <p>{status === "starting" ? t.recorder.starting : status === "denied" ? t.recorder.denied : t.recorder.unsupported}</p>
              {status !== "starting" && (
                <Link to="/analysis" className="button blue">
                  {t.import}
                </Link>
              )}
            </div>
          </div>
        )}

        {status === "ready" && !recording && !editFrame && (
          <div className="absolute left-3 bottom-3 sm:top-16 sm:bottom-auto max-w-xs rounded-xl bg-black/65 backdrop-blur px-3 py-2 text-xs space-y-1">
            <div className="flex items-center justify-between gap-3 font-semibold text-sm">
              <span>{ck.title}</span>
              <span className={overall === "good" ? "text-emerald-400" : overall === "fair" ? "text-amber-400" : "text-red-400"}>
                {ck[overall]}
              </span>
            </div>
            <ul className="space-y-0.5">
              <CheckRow level={court} text={court === "bad" ? ck.courtMissing : ck.court} />
              <CheckRow level={playersL} text={ck.players} />
              <CheckRow level={stable} text={ck.stable} />
              <CheckRow level={lightL} text={ck.light} />
              <CheckRow level={fpsL} text={fpsL === "warn" ? ck.fps30 : ck.fps} />
              <CheckRow level={heightL} text={heightL === "warn" ? ck.heightLow : ck.height} />
            </ul>
            {portrait && <p className="text-amber-300">{t.recorder.tipLandscape}</p>}
            <button className="underline text-sky-300" onClick={openEditor}>
              {t.session.adjustCourt}
            </button>
          </div>
        )}

        <Link to="/analysis" className="absolute top-3 left-3 rounded-full bg-black/50 w-10 h-10 flex items-center justify-center" aria-label="Close">
          <i aria-hidden className="mdi mdi-close text-xl" />
        </Link>
        {recording && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-red-600 px-3 py-1 text-sm font-mono">
            ● {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center py-4">
        <button
          disabled={status !== "ready"}
          onClick={recording ? stopRecording : startRecording}
          aria-label={recording ? t.recorder.stop : t.recorder.start}
          className="rounded-full border-4 border-white w-18 h-18 flex items-center justify-center disabled:opacity-40"
          style={{ width: 72, height: 72 }}
        >
          <span className={recording ? "bg-red-600 w-7 h-7 rounded-md" : "bg-red-600 w-14 h-14 rounded-full"} />
        </button>
      </div>
    </div>
  );
}
