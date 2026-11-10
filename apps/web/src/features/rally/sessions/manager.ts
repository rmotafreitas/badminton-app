/**
 * Offline-first orchestration of Rally Analysis sessions.
 *
 *  record/import ─► local session (IndexedDB: metadata + video blob)
 *        │
 *        ├─► register on the server when online (idempotent on clientId)
 *        ├─► upload a 720p review copy (transcode if needed) — presigned PUT
 *        └─► analysis queue (one at a time, in a worker; server lock so only
 *            one device analyses a session) ─► result saved locally,
 *            uploaded (gzip) + compact summary submitted
 *
 * The UI subscribes; nothing here blocks the user. Work resumes on the next
 * app open, and as soon as the network comes back.
 */
import type { RallyRepo } from "@/features/rally/port";
import type { RallyFormat, RallySession, RallySummary } from "@/features/rally/model";
import type { AnalysisRequest, AnalysisResponse } from "@/features/rally/engine/analysis/analysis.worker";
import type { CalibrationCheck } from "@/features/rally/engine/analysis/analyze";
import type { AnalysisResult, Calibration, Corrections, SessionFormat } from "@/features/rally/engine/types";
import { applyCorrections } from "@/features/rally/engine/stats";
import { defaultTranscoder, fitsReviewCopy, REVIEW_COPY, type VideoTranscoder } from "@/features/rally/media/transcoder";
import { idbAll, idbDelete, idbGet, idbGetBlob, idbPut, idbPutBlob, requestPersistence, STORES } from "@/features/rally/storage/idb";
import { discardRecording, leftoverRecordings } from "./recording-buffer";

/** The device couldn't store a video (usually: storage full). */
export class StorageError extends Error {
  constructor(cause: unknown) {
    super("Not enough storage on this device to keep the video.", { cause });
    this.name = "StorageError";
  }
}

export type UploadState = "pending" | "transcoding" | "uploading" | "done" | "failed" | "unavailable";
/** Renew the analysis lease (10 min on the server) every 4 minutes. */
const LOCK_RENEW_MS = 4 * 60_000;

/** HTTP status of a failed API call (ApiError from the Eden client), if it had one. */
const httpStatus = (e: unknown): number | undefined =>
  typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;

export type AnalysisState = "waiting" | "queued" | "needs-court" | "running" | "done" | "failed";

export interface LocalSession {
  clientId: string;
  serverId?: string;
  title: string | null;
  recordedAt: string;
  durationS: number;
  source: "camera" | "import" | "remote";
  mime: string;
  bytes: number;
  width: number;
  height: number;
  fps: number;
  hasLocalVideo: boolean;
  upload: { state: UploadState; progress?: number; error?: string };
  analysis: {
    state: AnalysisState;
    progress?: number;
    phase?: string;
    error?: string;
  };
  /** Court corners confirmed by a person (setup, court check, adjust). */
  corners?: Calibration["corners"];
  /** Auto-detected corners awaiting confirmation, and their score. */
  courtGuess?: {
    corners: Calibration["corners"] | null;
    score: number;
    width: number;
    height: number;
  };
  format?: SessionFormat;
  corrections?: Corrections;
  resultUploaded?: boolean;
  summary?: RallySummary;
  updatedAt: number;
}

type Listener = () => void;

const DEVICE_KEY = "rally-device-id";

/** Court detections this confident skip the one-tap confirmation. */
const AUTO_CONFIRM_SCORE = 0.85;

export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `dev-${crypto.randomUUID()}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "dev-ephemeral-device";
  }
}

export function newClientId(): string {
  return `rs-${crypto.randomUUID()}`;
}

export function summarise(result: AnalysisResult, corrections?: Corrections): RallySummary {
  const r = applyCorrections(result, corrections);
  return {
    version: 1,
    format: r.format,
    durationS: r.video.durationS,
    calibrationScore: r.calibration?.score ?? null,
    stats: r.stats,
    shots: r.shots
      .filter((s) => !s.deleted)
      .map((s) => ({
        id: s.id,
        rallyId: s.rallyId,
        t: s.t,
        hitter: s.hitter,
        type: s.type,
        speedKmh: s.speedKmh,
        speedConfidence: s.speedConfidence,
        ...(s.reviewed ? { reviewed: true } : {}),
      })),
  };
}

async function gzipJson(value: unknown): Promise<Blob> {
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

export async function gunzipJson<T>(blob: Blob): Promise<T> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(stream).text()) as T;
}

/** PUT with upload progress (fetch has none). */
function putWithProgress(url: string, body: Blob, contentType: string, onProgress: (f: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

const errMsg = (e: unknown) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
  (e instanceof Error ? e.message : String(e));

export class SessionManager {
  private sessions = new Map<string, LocalSession>();
  private listeners = new Set<Listener>();
  private worker: Worker | null = null;
  private compacting = new Map<string, { done: Promise<Blob | undefined>; listeners: Set<(p: number) => void>; ctrl: AbortController }>();
  private running: string | null = null;
  private syncing = false;
  private wakeLock: { release(): Promise<void> } | null = null;
  private snapshotCache: LocalSession[] = [];
  readonly ready: Promise<void>;
  /** Run queued analyses automatically while the app is open. */
  autoRun = true;

  private readonly repo: RallyRepo;
  private readonly transcoder: VideoTranscoder;

  constructor(repo: RallyRepo, transcoder: VideoTranscoder = defaultTranscoder) {
    this.repo = repo;
    this.transcoder = transcoder;
    this.ready = this.load();
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => void this.sync());
    }
  }

  private async load() {
    try {
      const all = await idbAll<LocalSession>(STORES.sessions);
      for (const s of all) {
        // A run interrupted by closing the app resumes from its checkpoint.
        if (s.analysis.state === "running") s.analysis = { state: "queued" };
        if (s.upload.state === "uploading" || s.upload.state === "transcoding") s.upload = { state: "pending" };
        this.sessions.set(s.clientId, s);
      }
    } catch {
      // IndexedDB unavailable (private mode): sessions live in memory only.
    }
    this.emit();
    void requestPersistence();
    // Not awaited: it goes through addVideo, which waits for `ready`.
    void this.recoverRecordings();
    void this.sync();
    void this.pump();
  }

  /** Turns recordings cut short (tab killed, battery died) back into sessions. */
  private async recoverRecordings() {
    try {
      for (const r of await leftoverRecordings()) {
        try {
          await this.addVideo(r.video, {
            source: "camera",
            recordedAt: new Date(r.startedAt),
            autoAnalyse: false,
          });
          await discardRecording(r.id);
        } catch {
          // Unreadable or still no room: keep the chunks for the next start.
        }
      }
    } catch {
      // IndexedDB unavailable.
    }
  }

  // ── subscription ─────────────────────────────────────────────────────────

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Stable array reference between changes (for useSyncExternalStore). */
  snapshot(): LocalSession[] {
    return this.snapshotCache;
  }

  get(clientId: string): LocalSession | undefined {
    return this.sessions.get(clientId);
  }

  findByServerId(serverId: string): LocalSession | undefined {
    return [...this.sessions.values()].find((s) => s.serverId === serverId);
  }

  private emit() {
    this.snapshotCache = [...this.sessions.values()].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
    for (const l of this.listeners) l();
  }

  private async patch(clientId: string, patch: Partial<LocalSession>) {
    const cur = this.sessions.get(clientId);
    if (!cur) return;
    const next = { ...cur, ...patch, updatedAt: Date.now() };
    this.sessions.set(clientId, next);
    this.emit();
    await idbPut(STORES.sessions, clientId, next).catch(() => undefined);
  }

  // ── creation ─────────────────────────────────────────────────────────────

  async addVideo(
    video: Blob,
    meta: {
      source: LocalSession["source"];
      title?: string | null;
      recordedAt?: Date;
      corners?: Calibration["corners"];
      serverId?: string;
      clientId?: string;
      autoAnalyse?: boolean;
    },
  ): Promise<string> {
    await this.ready;
    const info = await this.transcoder.probe(video);
    const clientId = meta.clientId ?? newClientId();
    const s: LocalSession = {
      clientId,
      serverId: meta.serverId,
      title: meta.title ?? null,
      recordedAt: (meta.recordedAt ?? new Date()).toISOString(),
      durationS: Math.round(info.durationS * 100) / 100,
      source: meta.source,
      mime: video.type || "video/mp4",
      bytes: video.size,
      width: info.width,
      height: info.height,
      fps: Math.round(info.fps * 100) / 100,
      hasLocalVideo: true,
      upload: meta.source === "remote" ? { state: "done" } : { state: "pending" },
      analysis: { state: meta.autoAnalyse === false ? "waiting" : "queued" },
      corners: meta.corners,
      updatedAt: Date.now(),
    };
    // The video is the one thing that can't be recreated: if it can't be
    // stored (quota, private mode), fail loudly so the caller can offer a
    // download instead of creating a session with no video behind it.
    try {
      await idbPutBlob(STORES.videos, clientId, video);
      await idbPut(STORES.sessions, clientId, s);
    } catch (e) {
      await idbDelete(STORES.videos, clientId).catch(() => undefined);
      throw new StorageError(e);
    }
    this.sessions.set(clientId, s);
    this.emit();
    void this.sync();
    void this.pump();
    return clientId;
  }

  /** Download a session recorded elsewhere so this device can analyse/play it. */
  async fetchRemote(server: RallySession): Promise<string> {
    const existing = this.findByServerId(server.id);
    if (existing?.hasLocalVideo) return existing.clientId;
    const { url } = await this.repo.videoUrl(server.id);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    const blob = await res.blob();
    return this.addVideo(blob, {
      source: "remote",
      serverId: server.id,
      clientId: server.clientId ?? newClientId(),
      title: server.title,
      recordedAt: server.recordedAt,
      autoAnalyse: server.status !== "analysed",
    });
  }

  async getVideo(clientId: string): Promise<Blob | undefined> {
    return idbGetBlob(STORES.videos, clientId).catch(() => undefined);
  }

  async getResult(clientId: string): Promise<AnalysisResult | undefined> {
    return idbGet<AnalysisResult>(STORES.results, clientId).catch(() => undefined);
  }

  /** Full analysis from the server (another device analysed it). */
  async fetchRemoteResult(serverId: string): Promise<AnalysisResult> {
    const { url } = await this.repo.resultUrl(serverId);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed (${res.status})`);
    return gunzipJson<AnalysisResult>(await res.blob());
  }

  // ── edits ────────────────────────────────────────────────────────────────

  async getCourtFrame(clientId: string): Promise<Blob | undefined> {
    return idbGetBlob(STORES.frames, clientId).catch(() => undefined);
  }

  async setCorners(clientId: string, corners: Calibration["corners"], reanalyse = true) {
    await this.patch(clientId, {
      corners,
      courtGuess: undefined,
      ...(reanalyse ? { analysis: { state: "queued" as const } } : {}),
    });
    await idbDelete(STORES.checkpoints, clientId).catch(() => undefined);
    if (reanalyse) void this.pump();
  }

  async setFormat(clientId: string, format: SessionFormat) {
    const s = this.sessions.get(clientId);
    if (!s) return;
    await this.patch(clientId, {
      format,
      corrections: { ...s.corrections, format },
    });
    if (s.serverId) await this.repo.update(s.serverId, { format }).catch(() => undefined);
  }

  async saveCorrections(clientId: string, corrections: Corrections) {
    const s = this.sessions.get(clientId);
    if (!s) return;
    const result = await this.getResult(clientId);
    const summary = result ? summarise(result, corrections) : s.summary;
    await this.patch(clientId, { corrections, summary });
    if (s.serverId && navigator.onLine) {
      await this.repo.update(s.serverId, { corrections }).catch(() => undefined);
      if (summary && result) {
        await this.repo
          .submitResult(s.serverId, {
            summary,
            format: summary.format,
            deviceId: deviceId(),
          })
          .catch(() => undefined);
      }
    }
  }

  async rename(clientId: string, title: string | null) {
    const s = this.sessions.get(clientId);
    if (!s) return;
    await this.patch(clientId, { title });
    if (s.serverId) await this.repo.update(s.serverId, { title }).catch(() => undefined);
  }

  /** Removes the local copy (and the server session when `everywhere`). */
  async remove(clientId: string, everywhere: boolean) {
    const s = this.sessions.get(clientId);
    if (!s) return;
    if (this.running === clientId) this.cancel(clientId);
    if (everywhere && s.serverId) await this.repo.delete(s.serverId);
    this.sessions.delete(clientId);
    this.emit();
    await Promise.all([
      idbDelete(STORES.sessions, clientId),
      idbDelete(STORES.videos, clientId),
      idbDelete(STORES.results, clientId),
      idbDelete(STORES.checkpoints, clientId),
      idbDelete(STORES.frames, clientId),
    ]).catch(() => undefined);
  }

  /** Frees device space; the session stays on the server. */
  async dropLocalVideo(clientId: string) {
    await idbDelete(STORES.videos, clientId).catch(() => undefined);
    await this.patch(clientId, { hasLocalVideo: false });
  }

  // ── analysis queue ───────────────────────────────────────────────────────

  queueAnalysis(clientId: string) {
    void this.patch(clientId, { analysis: { state: "queued" } }).then(() => this.pump());
  }

  cancel(clientId: string) {
    this.compacting.get(clientId)?.ctrl.abort();
    if (this.running === clientId) {
      this.worker?.postMessage({
        type: "cancel",
        jobId: clientId,
      } satisfies AnalysisRequest);
    }
    void this.patch(clientId, { analysis: { state: "waiting" } });
  }

  setAutoRun(on: boolean) {
    this.autoRun = on;
    if (on) void this.pump();
  }

  get busy() {
    return this.running;
  }

  private async pump() {
    await this.ready;
    if (this.running || !this.autoRun) return;
    const next = [...this.sessions.values()]
      .filter((s) => s.analysis.state === "queued" && s.hasLocalVideo)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))[0];
    if (next) await this.run(next.clientId);
  }

  private async run(clientId: string) {
    const s = this.sessions.get(clientId);
    if (!s || !(await this.getVideo(clientId))) {
      await this.patch(clientId, {
        analysis: { state: "failed", error: "Video not on this device" },
      });
      return;
    }
    this.running = clientId;
    const dev = deviceId();
    // The server's lock is a 10-minute lease: renew it while this device works, so a long analysis isn't taken for
    // an abandoned one (and no other device starts on it).
    const heartbeat =
      s.serverId !== undefined
        ? setInterval(() => {
            if (navigator.onLine && s.serverId) void this.repo.lock(s.serverId, dev).catch(() => undefined);
          }, LOCK_RENEW_MS)
        : null;
    try {
      if (s.serverId && navigator.onLine) {
        try {
          await this.repo.lock(s.serverId, dev);
        } catch (e) {
          if (httpStatus(e) === 409) {
            await this.patch(clientId, {
              analysis: {
                state: "waiting",
                error: "Another device is analysing this session",
              },
            });
            return;
          }
          // Offline-ish errors: analyse anyway, the lock is best-effort.
        }
      }
      await this.acquireWakeLock();
      await this.patch(clientId, {
        analysis: { state: "running", progress: 0, phase: "compress" },
      });
      let lastEmit = 0;
      const video = await this.compact(clientId, (p) => {
        const now = performance.now();
        if (now - lastEmit < 500) return;
        lastEmit = now;
        void this.patch(clientId, { analysis: { state: "running", progress: p, phase: "compress" } });
      });
      if (!video) throw new Error("Video not on this device");
      const current = this.sessions.get(clientId) ?? s; // compacting rescales the corners
      await this.patch(clientId, {
        analysis: { state: "running", progress: 0, phase: "prepare" },
      });
      let corners = current.corners;
      if (!corners) {
        // Quick court check: a wrong court ruins everything downstream, and
        // confirming it is one tap. Only very confident detections skip it.
        const check = await this.calibrate(clientId, video);
        await idbPutBlob(STORES.frames, clientId, check.frame).catch(() => undefined);
        const cal = check.calibration;
        if (!cal || cal.score < AUTO_CONFIRM_SCORE) {
          await this.patch(clientId, {
            analysis: { state: "needs-court" },
            courtGuess: {
              corners: cal?.corners ?? null,
              score: cal?.score ?? 0,
              width: check.width,
              height: check.height,
            },
          });
          if (s.serverId && navigator.onLine) await this.repo.unlock(s.serverId, dev).catch(() => undefined);
          return;
        }
        corners = cal.corners;
        await this.patch(clientId, { corners });
      }
      const result = await this.analyse(clientId, video, { ...current, corners });
      await idbPut(STORES.results, clientId, result);
      const summary = summarise(result, s.corrections);
      await this.patch(clientId, {
        analysis: { state: "done" },
        summary,
        format: s.format ?? result.format,
        resultUploaded: false,
      });
      void this.sync();
    } catch (e) {
      const cancelled = (e as { cancelled?: boolean }).cancelled;
      await this.patch(clientId, {
        analysis: cancelled ? { state: "waiting" } : { state: "failed", error: errMsg(e) },
      });
      if (s.serverId && navigator.onLine) await this.repo.unlock(s.serverId, dev, !cancelled).catch(() => undefined);
    } finally {
      if (heartbeat) clearInterval(heartbeat);
      this.running = null;
      await this.releaseWakeLock();
      void this.pump();
    }
  }

  /**
   * The video to analyse and upload: a 720p review copy (REVIEW_COPY), made once and stored in place of the
   * original. Phone recordings are 4K and hundreds of MB, and iOS runs out of memory decoding them next to the
   * models. Concurrent callers (analysis, upload) share one conversion; a device that can't convert keeps the
   * original.
   */
  private compact(clientId: string, onProgress?: (p: number) => void): Promise<Blob | undefined> {
    let job = this.compacting.get(clientId);
    if (!job) {
      const listeners = new Set<(p: number) => void>();
      const ctrl = new AbortController();
      const done = this.makeCompact(clientId, (p) => listeners.forEach((l) => l(p)), ctrl.signal).finally(() =>
        this.compacting.delete(clientId),
      );
      job = { done, listeners, ctrl };
      this.compacting.set(clientId, job);
    }
    if (onProgress) job.listeners.add(onProgress);
    return job.done;
  }

  private async makeCompact(clientId: string, onProgress: (p: number) => void, signal: AbortSignal) {
    const video = await this.getVideo(clientId);
    if (!video) return undefined;
    const info = await this.transcoder.probe(video);
    if (fitsReviewCopy(info) || !(await this.transcoder.supported())) return video;
    let small: Blob;
    try {
      small = await this.transcoder.transcode(video, { ...REVIEW_COPY, onProgress, signal });
    } catch (e) {
      if (signal.aborted) throw Object.assign(new Error("Cancelled"), { cancelled: true });
      console.warn("Could not compress the video; using the original", e);
      return video;
    }
    const out = await this.transcoder.probe(small);
    try {
      await idbPutBlob(STORES.videos, clientId, small);
    } catch {
      return video; // no room for the copy: keep the original (the corners stay in its pixels)
    }
    // A partial analysis of the original is in its pixels and timeline: start over.
    await idbDelete(STORES.checkpoints, clientId).catch(() => undefined);
    const kx = out.width / info.width;
    const ky = out.height / info.height;
    const corners = this.sessions.get(clientId)?.corners;
    await this.patch(clientId, {
      mime: small.type,
      bytes: small.size,
      width: out.width,
      height: out.height,
      fps: Math.round(out.fps * 100) / 100,
      corners: corners?.map((c) => ({ x: c.x * kx, y: c.y * ky })) as Calibration["corners"] | undefined,
    });
    return small;
  }

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL("../engine/analysis/analysis.worker.ts", import.meta.url), {
        type: "module",
      });
    }
    return this.worker;
  }

  private calibrate(clientId: string, video: Blob): Promise<CalibrationCheck> {
    const worker = this.getWorker();
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent<AnalysisResponse>) => {
        const m = ev.data;
        if (m.jobId !== clientId) return;
        if (m.type === "calibrated") {
          worker.removeEventListener("message", onMessage);
          resolve(m.check);
        } else if (m.type === "error") {
          worker.removeEventListener("message", onMessage);
          reject(Object.assign(new Error(m.message), { cancelled: m.cancelled }));
        }
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        type: "calibrate",
        jobId: clientId,
        file: video,
      } satisfies AnalysisRequest);
    });
  }

  private analyse(clientId: string, video: Blob, s: LocalSession): Promise<AnalysisResult> {
    const worker = this.getWorker();
    return new Promise((resolve, reject) => {
      let lastEmit = 0;
      const onMessage = (ev: MessageEvent<AnalysisResponse>) => {
        const m = ev.data;
        if (m.jobId !== clientId) return;
        if (m.type === "progress") {
          m.progress.preview?.close();
          const now = performance.now();
          if (now - lastEmit > 500 || m.progress.progress >= 1) {
            lastEmit = now;
            void this.patch(clientId, {
              analysis: {
                state: "running",
                progress: m.progress.progress,
                phase: m.progress.phase,
              },
            });
          }
          return;
        }
        if (m.type === "calibrated") return;
        worker.removeEventListener("message", onMessage);
        if (m.type === "done") resolve(m.result);
        else reject(Object.assign(new Error(m.message), { cancelled: m.cancelled }));
      };
      worker.addEventListener("message", onMessage);
      worker.postMessage({
        type: "start",
        jobId: clientId,
        file: video,
        corners: s.corners,
        format: s.format ?? s.corrections?.format,
      } satisfies AnalysisRequest);
    });
  }

  private async acquireWakeLock() {
    try {
      const wl = (
        navigator as Navigator & {
          wakeLock?: {
            request(t: "screen"): Promise<{ release(): Promise<void> }>;
          };
        }
      ).wakeLock;
      this.wakeLock = (await wl?.request("screen")) ?? null;
    } catch {
      this.wakeLock = null;
    }
  }

  private async releaseWakeLock() {
    await this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  // ── sync ─────────────────────────────────────────────────────────────────

  async sync() {
    await this.ready;
    if (this.syncing || typeof navigator === "undefined" || !navigator.onLine) return;
    this.syncing = true;
    try {
      for (const s of [...this.sessions.values()]) {
        try {
          await this.syncOne(s.clientId);
        } catch {
          // Keep going; the next sync retries.
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  private async syncOne(clientId: string) {
    let s = this.sessions.get(clientId);
    if (!s) return;
    if (!s.serverId) {
      const created = await this.repo.create({
        clientId: s.clientId,
        title: s.title,
        recordedAt: s.recordedAt,
        durationS: Math.max(0.1, s.durationS),
      });
      await this.patch(clientId, { serverId: created.id });
      s = this.sessions.get(clientId)!;
    }
    if (s.upload.state === "pending" || s.upload.state === "failed") await this.uploadVideo(clientId);
    s = this.sessions.get(clientId)!;
    if (s.analysis.state === "done" && !s.resultUploaded) await this.uploadResult(clientId);
  }

  private async uploadVideo(clientId: string) {
    const s = this.sessions.get(clientId)!;
    if (!s.hasLocalVideo || !s.serverId) return;
    try {
      await this.patch(clientId, { upload: { state: "transcoding", progress: 0 } });
      const body = await this.compact(clientId, (p) => void this.patch(clientId, { upload: { state: "transcoding", progress: p } }));
      if (!body) return;
      const type = body.type.includes("webm")
        ? "video/webm"
        : body.type.includes("quicktime")
          ? "video/quicktime"
          : "video/mp4";
      const up = await this.repo.requestVideoUpload(s.serverId, body.size, type);
      await this.patch(clientId, {
        upload: { state: "uploading", progress: 0 },
      });
      let last = 0;
      await putWithProgress(up.url, body, type, (p) => {
        if (p - last > 0.02 || p >= 1) {
          last = p;
          void this.patch(clientId, {
            upload: { state: "uploading", progress: p },
          });
        }
      });
      await this.repo.completeVideoUpload(s.serverId, up.key, body.size);
      await this.patch(clientId, { upload: { state: "done" } });
    } catch (e) {
      const status = httpStatus(e);
      await this.patch(clientId, {
        upload: {
          state: status === 409 ? "unavailable" : "failed",
          error: errMsg(e),
        },
      });
    }
  }

  private async uploadResult(clientId: string) {
    const s = this.sessions.get(clientId)!;
    const result = await this.getResult(clientId);
    if (!result || !s.serverId) return;
    const summary = summarise(result, s.corrections);
    let resultKey: string | null = null;
    const up = await this.repo.requestResultUpload(s.serverId);
    if (up) {
      const gz = await gzipJson(result);
      await putWithProgress(up.url, gz, "application/gzip", () => undefined);
      resultKey = up.key;
    }
    await this.repo.submitResult(s.serverId, {
      summary,
      format: (s.format ?? result.format) as RallyFormat,
      resultKey,
      deviceId: deviceId(),
    });
    if (s.corrections) await this.repo.update(s.serverId, { corrections: s.corrections }).catch(() => undefined);
    await this.patch(clientId, { resultUploaded: true });
  }
}

let singleton: SessionManager | null = null;

export function getSessionManager(repo: RallyRepo): SessionManager {
  if (!singleton) singleton = new SessionManager(repo);
  return singleton;
}
