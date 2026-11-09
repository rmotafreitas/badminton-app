/**
 * /lab — on-device feasibility benchmark for Rally Analysis (milestone 2).
 * Internal tool: English only, not linked from navigation.
 */
import { Button } from "@/shared/ui/button";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComputeBackend } from "@/features/rally/engine/runtime/types";
import type { ModelId } from "@/features/rally/engine/models/registry";
import type { Box } from "@/features/rally/engine/models/yolox";
import type { AnalysisRequest, AnalysisResponse } from "@/features/rally/engine/analysis/analysis.worker";
import type { AnalysisResult, Calibration } from "@/features/rally/engine/types";
import { OverlayPlayer } from "@/features/rally/ui/OverlayPlayer";
import type {
  MicroCase,
  MicroResult,
  PipelineConfig,
  PipelineResult,
  WorkerEnv,
  WorkerRequest,
  WorkerResponse,
} from "./protocol";

interface MainEnv {
  userAgent: string;
  deviceMemoryGB?: number;
  screen: string;
  webgpuMain: boolean;
  mediaRecorder: Record<string, boolean>;
  encoder: Record<string, string>;
  decoder: Record<string, string>;
  camera?: Record<string, unknown>;
}

const RUNTIMES = ["ort-jsep", "ort-webgpu"] as const;
const BACKENDS: ComputeBackend[] = ["webgpu", "wasm"];
const MICRO_MODELS: ModelId[] = [
  "yolox-tiny-person",
  "rtmpose-s",
  "rtmo-s",
  "tracknetv3-fp16",
  "tracknetv3",
  "inpaintnet",
];

const CODECS: Record<string, string> = {
  "h264 720p60": "avc1.64001F",
  "h264 1080p60": "avc1.640028",
  "hevc 1080p60": "hvc1.1.6.L123.B0",
  "vp9 720p60": "vp09.00.31.08",
};

async function codecSupport(kind: "encoder" | "decoder") {
  const out: Record<string, string> = {};
  const Api = kind === "encoder" ? globalThis.VideoEncoder : globalThis.VideoDecoder;
  if (!Api) return { unavailable: "no WebCodecs" };
  for (const [label, codec] of Object.entries(CODECS)) {
    const [w, h] = label.includes("1080") ? [1920, 1080] : [1280, 720];
    for (const hw of ["prefer-hardware", "prefer-software"] as const) {
      try {
        const cfg =
          kind === "encoder"
            ? { codec, width: w, height: h, framerate: 60, bitrate: 4_000_000, hardwareAcceleration: hw }
            : { codec, codedWidth: w, codedHeight: h, hardwareAcceleration: hw };
        const res = await (Api as typeof VideoEncoder).isConfigSupported(cfg as VideoEncoderConfig);
        out[`${label} ${hw === "prefer-hardware" ? "hw" : "sw"}`] = res.supported ? "yes" : "no";
      } catch (e) {
        out[`${label} ${hw === "prefer-hardware" ? "hw" : "sw"}`] = `err: ${(e as Error).message}`;
      }
    }
  }
  return out;
}

async function mainEnv(): Promise<MainEnv> {
  const types = [
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=hvc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  const mediaRecorder: Record<string, boolean> = {};
  for (const t of types) {
    mediaRecorder[t] = typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t);
  }
  let webgpuMain = false;
  try {
    webgpuMain = !!(await navigator.gpu?.requestAdapter());
  } catch {
    webgpuMain = false;
  }
  return {
    userAgent: navigator.userAgent,
    deviceMemoryGB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}x`,
    webgpuMain,
    mediaRecorder,
    encoder: await codecSupport("encoder"),
    decoder: await codecSupport("decoder"),
  };
}

function useLabWorker(onMessage: (m: WorkerResponse) => void) {
  const ref = useRef<Worker | null>(null);
  const handler = useRef(onMessage);
  useEffect(() => {
    handler.current = onMessage;
  });
  useEffect(() => {
    const w = new Worker(new URL("./benchmark.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerResponse>) => handler.current(e.data);
    w.onerror = (e) => handler.current({ type: "log", message: `Worker error: ${e.message}` });
    ref.current = w;
    w.postMessage({ type: "env" } satisfies WorkerRequest);
    return () => w.terminate();
  }, []);
  return useCallback((msg: WorkerRequest, transfer: Transferable[] = []) => {
    ref.current?.postMessage(msg, transfer);
  }, []);
}

function fmt(n: number | undefined, digits = 0) {
  return n === undefined ? "—" : n.toFixed(digits);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 text-card-foreground">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button size="sm" {...props} />;
}

function FullAnalysis({ file, onLog }: { file: File | null; onLog: (s: string) => void }) {
  const workerRef = useRef<Worker | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [wallS, setWallS] = useState<number | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [cornersText, setCornersText] = useState("");

  useEffect(() => () => workerRef.current?.terminate(), []);

  const run = async () => {
    let blob: Blob | null = file;
    if (!blob) {
      const res = await fetch("/lab/sample.mp4");
      if (!res.ok) return onLog("Pick a video first");
      blob = await res.blob();
    }
    setVideoUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(blob!);
    });
    workerRef.current?.terminate();
    const w = new Worker(new URL("../engine/analysis/analysis.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    const started = performance.now();
    setResult(null);
    setProgress("starting…");
    w.onmessage = (e: MessageEvent<AnalysisResponse>) => {
      const m = e.data;
      if (m.type === "progress") {
        const p = m.progress;
        setProgress(
          `${p.phase} ${Math.round(p.progress * 100)}%` +
            (p.videoS !== undefined ? ` · ${p.videoS.toFixed(1)}/${p.totalS?.toFixed(1)}s` : ""),
        );
        if (p.preview && canvasRef.current) {
          canvasRef.current.width = p.preview.width;
          canvasRef.current.height = p.preview.height;
          canvasRef.current.getContext("2d")!.drawImage(p.preview, 0, 0);
          p.preview.close();
        }
      } else if (m.type === "done") {
        setWallS((performance.now() - started) / 1000);
        setResult(m.result);
        (window as unknown as { __rallyLastResult?: AnalysisResult }).__rallyLastResult = m.result;
        setProgress(null);
        onLog("Analysis done");
      } else if (m.type === "error") {
        setProgress(null);
        onLog(`Analysis failed: ${m.message}`);
      }
    };
    let corners: Calibration["corners"] | undefined;
    try {
      corners = cornersText.trim() ? JSON.parse(cornersText) : undefined;
    } catch {
      onLog("Corners must be JSON: [{x,y}×4] near-left, near-right, far-right, far-left");
      return;
    }
    w.postMessage({
      type: "start",
      jobId: `lab-${Date.now()}`,
      file: blob,
      preview: true,
      debug: true,
      corners,
    } satisfies AnalysisRequest);
  };

  return (
    <Section title="6 · Full analysis (engine end-to-end)">
      <div className="flex gap-2 items-center">
        <Btn disabled={!!progress} onClick={run}>
          Analyse {file ? file.name : "sample"}
        </Btn>
        {progress && <span className="font-mono text-xs">{progress}</span>}
      </div>
      <input
        data-testid="corners"
        value={cornersText}
        onChange={(e) => setCornersText(e.target.value)}
        placeholder='Optional manual corners (source px): [{"x":..,"y":..}×4] NL, NR, FR, FL'
        className="w-full border rounded px-2 py-1 font-mono text-xs bg-transparent"
      />
      <canvas ref={canvasRef} className="w-full rounded-lg bg-muted" />
      {result && videoUrl && (
        <div data-testid="overlay-player">
          <OverlayPlayer src={videoUrl} result={result} />
        </div>
      )}
      {result && (
        <div className="font-mono text-xs space-y-1" data-testid="analysis-summary">
          <div>
            {result.video.width}x{result.video.height}@{result.video.fps} · {result.video.durationS}s analysed at{" "}
            {result.video.analysedFps}fps in {wallS?.toFixed(1)}s ({((wallS ?? 0) / result.video.durationS).toFixed(2)}×) ·{" "}
            {result.engine.backend}
          </div>
          <div>
            court: {result.calibration ? `${result.calibration.source} score ${result.calibration.score}` : "none"} ·
            format {result.format} · players {result.players.map((p) => p.id).join(",")} · shuttle samples{" "}
            {result.shuttle.length}
          </div>
          <div>
            rallies {result.stats.rallies} · shots {result.stats.shots} · avg rally {result.stats.avgRallyShots}
          </div>
          {result.stats.players.map((p) => (
            <div key={p.id}>
              {p.id}: {p.distanceM} m · {p.shots} shots {JSON.stringify(p.shotsByType)} · max {p.maxSpeedKmh ?? "—"}{" "}
              km/h
            </div>
          ))}
          <details>
            <summary>shots</summary>
            {result.shots.map((s) => (
              <div key={s.id}>
                {s.t.toFixed(2)}s {s.hitter} {s.type}({s.typeConfidence}) {s.speedKmh ?? "—"}km/h ({s.speedConfidence})
                apex {s.apexHeight ?? "—"} land {s.landing ? `${s.landing.x},${s.landing.y}` : "—"}
              </div>
            ))}
          </details>
          <details>
            <summary>json</summary>
            <pre data-testid="analysis-json" className="max-h-64 overflow-auto">
              {JSON.stringify({ ...result, tracks: "…", shuttle: "…" }, null, 1)}
            </pre>
          </details>
        </div>
      )}
    </Section>
  );
}

export default function LabPage() {
  const [workerEnv, setWorkerEnv] = useState<WorkerEnv | null>(null);
  const [env, setEnv] = useState<MainEnv | null>(null);
  const [logLine, setLogLine] = useState("");
  const [micro, setMicro] = useState<MicroResult[]>([]);
  const [microRunning, setMicroRunning] = useState(false);
  const [pipelineResults, setPipelineResults] = useState<PipelineResult[]>([]);
  const [pipelineProgress, setPipelineProgress] = useState<{ done: number; total: number } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [cfg, setCfg] = useState<PipelineConfig>({
    runtime: "ort-jsep",
    backend: "webgpu",
    shuttleModel: "tracknetv3-fp16",
    seconds: 20,
    personStride: 2,
  });
  const [live, setLive] = useState<{ fps: number; ms: number; boxes: number } | null>(null);
  const [liveOn, setLiveOn] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const liveState = useRef({ busy: false, count: 0, since: 0, stream: null as MediaStream | null });

  const drawLive = useCallback((boxes: Box[], width: number, height: number) => {
    const c = overlayRef.current;
    if (!c) return;
    c.width = width;
    c.height = height;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#a3e635";
    boxes.forEach((b) => ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1));
  }, []);

  const send = useLabWorker((m) => {
    switch (m.type) {
      case "env":
        setWorkerEnv(m.env);
        break;
      case "log":
        setLogLine(m.message);
        break;
      case "micro-result":
        setMicro((r) => [...r, m.result]);
        break;
      case "micro-done":
        setMicroRunning(false);
        setLogLine("Micro benchmarks done");
        break;
      case "pipeline-progress": {
        setPipelineProgress({ done: m.done, total: m.total });
        if (m.preview && previewRef.current) {
          const c = previewRef.current;
          c.width = m.preview.width;
          c.height = m.preview.height;
          c.getContext("2d")!.drawImage(m.preview, 0, 0);
          m.preview.close();
        }
        break;
      }
      case "pipeline-result":
        setPipelineProgress(null);
        setPipelineResults((r) => [...r, m.result]);
        setLogLine(m.result.ok ? "Pipeline done" : `Pipeline failed: ${m.result.error}`);
        break;
      case "live-ready":
        setLogLine(m.ok ? "Live detector ready" : `Live init failed: ${m.error}`);
        break;
      case "live-result": {
        const s = liveState.current;
        s.busy = false;
        s.count++;
        const elapsed = (performance.now() - s.since) / 1000;
        setLive({ fps: s.count / elapsed, ms: m.ms, boxes: m.boxes.length });
        drawLive(m.boxes, m.width, m.height);
        break;
      }
    }
  });

  useEffect(() => {
    mainEnv().then(setEnv);
  }, []);

  const runMicro = (backends: ComputeBackend[]) => {
    const cases: MicroCase[] = [];
    for (const model of MICRO_MODELS)
      for (const runtime of RUNTIMES)
        for (const backend of backends) {
          // The native-WebGPU flavour's wasm path duplicates jsep's wasm; skip it.
          if (runtime === "ort-webgpu" && backend === "wasm") continue;
          // fp32 TrackNet on wasm takes seconds per run; fp16 weights are
          // upcast on CPU anyway, so one wasm TrackNet case is enough.
          if (model === "tracknetv3" && backend === "wasm") continue;
          cases.push({ model, runtime, backend });
        }
    setMicro([]);
    setMicroRunning(true);
    send({ type: "micro", cases, maxRuns: 20 });
  };

  const runPipeline = async () => {
    let blob: Blob | null = file;
    if (!blob) {
      const res = await fetch("/lab/sample.mp4");
      if (!res.ok) {
        setLogLine("Pick a video first (no /lab/sample.mp4 on this server)");
        return;
      }
      blob = await res.blob();
    }
    setPipelineProgress({ done: 0, total: 1 });
    send({ type: "pipeline", file: blob, config: cfg });
  };

  const startLive = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 } },
        audio: false,
      });
      const track = stream.getVideoTracks()[0]!;
      const caps = track.getCapabilities?.() as Record<string, unknown> | undefined;
      setEnv((e) =>
        e
          ? {
              ...e,
              camera: {
                settings: track.getSettings(),
                maxFrameRate: (caps?.frameRate as { max?: number } | undefined)?.max,
                maxWidth: (caps?.width as { max?: number } | undefined)?.max,
                maxHeight: (caps?.height as { max?: number } | undefined)?.max,
              },
            }
          : e,
      );
      liveState.current = { busy: false, count: 0, since: performance.now(), stream };
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      send({ type: "live-init", runtime: cfg.runtime, backend: cfg.backend });
      setLiveOn(true);
      const loop = async () => {
        const s = liveState.current;
        if (!s.stream) return;
        if (!s.busy && v.readyState >= 2) {
          s.busy = true;
          const bmp = await createImageBitmap(v);
          send({ type: "live-frame", bitmap: bmp }, [bmp]);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch (e) {
      setLogLine(`Camera failed: ${(e as Error).message}`);
    }
  };

  const stopLive = () => {
    liveState.current.stream?.getTracks().forEach((t) => t.stop());
    liveState.current.stream = null;
    setLiveOn(false);
  };

  useEffect(() => () => liveState.current.stream?.getTracks().forEach((t) => t.stop()), []);

  const report = useMemo(
    () =>
      JSON.stringify(
        { at: new Date().toISOString(), env, workerEnv, micro, pipeline: pipelineResults, live },
        null,
        2,
      ),
    [env, workerEnv, micro, pipelineResults, live],
  );

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Rally lab results", text: report });
        return;
      }
    } catch {
      // fall through to clipboard
    }
    await navigator.clipboard.writeText(report);
    setLogLine("Results copied to clipboard");
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4 text-sm">
      <header>
        <h1 className="text-xl font-bold">Rally Analysis · device lab</h1>
        <p className="text-muted-foreground">
          Measures whether this device can run the analysis models. Keep the screen on; plug in for
          the long tests. When done, tap “Share results”.
        </p>
        <p className="mt-1 font-mono text-xs text-primary min-h-4">{logLine}</p>
      </header>

      <Section title="1 · Device">
        {!env || !workerEnv ? (
          <p>Detecting…</p>
        ) : (
          <ul className="space-y-1">
            <li>
              WebGPU: main {env.webgpuMain ? "✅" : "❌"} · worker {workerEnv.webgpuInWorker ? "✅" : "❌"}
              {workerEnv.adapter &&
                ` · ${workerEnv.adapter.vendor} ${workerEnv.adapter.architecture} ${workerEnv.adapter.description}`}
              {workerEnv.shaderF16 !== undefined && ` · f16 ${workerEnv.shaderF16 ? "✅" : "❌"}`}
            </li>
            <li>
              Cores {workerEnv.hardwareConcurrency} · RAM {env.deviceMemoryGB ?? "?"}GB · isolated (wasm
              threads) {workerEnv.crossOriginIsolated ? "✅" : "❌"} · screen {env.screen}
            </li>
            <li>
              Recorder:{" "}
              {Object.entries(env.mediaRecorder)
                .filter(([, v]) => v)
                .map(([k]) => k)
                .join(", ") || "none"}
            </li>
            <li>
              HW encode h264 720p60: {env.encoder["h264 720p60 hw"] ?? "?"} · 1080p60:{" "}
              {env.encoder["h264 1080p60 hw"] ?? "?"} · HW decode h264 1080p:{" "}
              {env.decoder["h264 1080p60 hw"] ?? "?"}
            </li>
            <li className="text-xs text-muted-foreground break-all">{env.userAgent}</li>
          </ul>
        )}
      </Section>

      <Section title="2 · Model speed (synthetic input)">
        <div className="flex gap-2 flex-wrap">
          <Btn disabled={microRunning} onClick={() => runMicro(["webgpu"])}>
            Run WebGPU
          </Btn>
          <Btn disabled={microRunning} onClick={() => runMicro(BACKENDS)}>
            Run WebGPU + WASM (slow)
          </Btn>
          {microRunning && <Btn onClick={() => send({ type: "cancel" })}>Cancel</Btn>}
        </div>
        {micro.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>model</th>
                  <th>runtime</th>
                  <th>backend</th>
                  <th className="text-right">load ms</th>
                  <th className="text-right">1st ms</th>
                  <th className="text-right">median ms</th>
                  <th className="text-right">p90 ms</th>
                </tr>
              </thead>
              <tbody>
                {micro.map((r, i) => (
                  <tr key={i} className="border-t">
                    <td>{r.model}</td>
                    <td>{r.runtime}</td>
                    <td>{r.backend}</td>
                    {r.ok ? (
                      <>
                        <td className="text-right">{fmt(r.loadMs)}</td>
                        <td className="text-right">{fmt(r.firstRunMs)}</td>
                        <td className="text-right font-semibold">{fmt(r.medianMs, 1)}</td>
                        <td className="text-right">{fmt(r.p90Ms, 1)}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-red-500">
                        {r.error}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="3 · Real video pipeline (decode → players → shuttle)">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="file"
            accept="video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-xs"
          />
          <select
            value={`${cfg.runtime}|${cfg.backend}`}
            onChange={(e) => {
              const [runtime, backend] = e.target.value.split("|") as [string, ComputeBackend];
              setCfg((c) => ({ ...c, runtime, backend }));
            }}
            className="border rounded px-2 py-1 bg-transparent"
          >
            <option value="ort-jsep|webgpu">JSEP WebGPU</option>
            <option value="ort-webgpu|webgpu">Native WebGPU</option>
            <option value="ort-jsep|wasm">WASM</option>
          </select>
          <select
            value={cfg.shuttleModel}
            onChange={(e) => setCfg((c) => ({ ...c, shuttleModel: e.target.value as ModelId }))}
            className="border rounded px-2 py-1 bg-transparent"
          >
            <option value="tracknetv3-fp16">TrackNet fp16</option>
            <option value="tracknetv3">TrackNet fp32</option>
          </select>
          <label className="flex items-center gap-1">
            seconds
            <input
              type="number"
              min={5}
              max={600}
              value={cfg.seconds}
              onChange={(e) => setCfg((c) => ({ ...c, seconds: Number(e.target.value) }))}
              className="w-16 border rounded px-1 bg-transparent"
            />
          </label>
          <Btn disabled={!!pipelineProgress} onClick={runPipeline}>
            Run
          </Btn>
          {pipelineProgress && <Btn onClick={() => send({ type: "cancel" })}>Cancel</Btn>}
        </div>
        {pipelineProgress && (
          <div className="h-2 rounded bg-muted">
            <div
              className="h-2 rounded bg-primary"
              style={{ width: `${Math.min(100, (pipelineProgress.done / pipelineProgress.total) * 100)}%` }}
            />
          </div>
        )}
        <canvas ref={previewRef} className="w-full rounded-lg bg-muted" />
        {pipelineResults.map((r, i) => (
          <div key={i} className="rounded bg-muted p-2 font-mono text-xs">
            {r.ok ? (
              <>
                {r.runtime}/{r.backend}/{r.shuttleModel} · {r.video?.width}x{r.video?.height}@{r.video?.fps}{" "}
                {r.video?.codec} · {r.frames} frames in {r.wallS}s →{" "}
                <b>{r.throughputFps} fps</b> ({r.realtimeFactor}× clip time) · decode {r.decodeMsPerFrame}
                ms/f · shuttle {r.shuttleMsPerInference} ms/8f · players {r.personMsPerFrame} ms · shuttle seen{" "}
                {Math.round((r.shuttleVisibleRatio ?? 0) * 100)}% · fps per 5s: {r.timeline?.join(", ")}
              </>
            ) : (
              <span className="text-red-500">{r.error}</span>
            )}
          </div>
        ))}
      </Section>

      <Section title="4 · Live camera (player detection)">
        <div className="flex gap-2">
          {!liveOn ? <Btn onClick={startLive}>Start camera</Btn> : <Btn onClick={stopLive}>Stop</Btn>}
          {live && (
            <span className="font-mono text-xs self-center">
              {live.fps.toFixed(1)} fps · {live.ms.toFixed(0)} ms · {live.boxes} people
            </span>
          )}
        </div>
        <div className="relative">
          <video ref={videoRef} playsInline muted className="w-full rounded-lg" />
          <canvas ref={overlayRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        </div>
        {env?.camera && <pre className="text-xs overflow-x-auto">{JSON.stringify(env.camera)}</pre>}
      </Section>

      <FullAnalysis file={file} onLog={setLogLine} />

      <Section title="5 · Results">
        <Btn onClick={share}>Share results</Btn>
        <details>
          <summary className="cursor-pointer text-muted-foreground">JSON</summary>
          <pre className="text-xs overflow-x-auto max-h-80">{report}</pre>
        </details>
      </Section>
    </div>
  );
}
