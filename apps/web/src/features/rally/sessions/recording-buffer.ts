/**
 * Streams MediaRecorder chunks to IndexedDB as they arrive, so a long
 * recording never has to fit in memory (phones kill tabs that hold GBs) and a
 * crash, a killed tab or a dead battery mid-recording loses at most a second.
 * Leftover chunks are turned back into a session on the next app start
 * (SessionManager.recoverRecordings).
 *
 * If a write fails (storage full), the chunk is kept in memory instead and
 * `storageError` is set, so the recording itself is never lost.
 */
import { idbDelete, idbGet, idbGetBlob, idbKeys, idbPut, idbPutBlob, STORES } from "@/features/rally/storage/idb";

interface RecordingMeta {
  id: string;
  mime: string;
  startedAt: number;
  /** Last successful chunk write (ms), to tell a live recording from a dead one. */
  lastAt: number;
}

const metaKey = (id: string) => `${id}:meta`;
const chunkKey = (id: string, seq: number) => `${id}:${String(seq).padStart(7, "0")}`;

export class RecordingBuffer {
  readonly id: string;
  readonly mime: string;
  readonly startedAt: number;
  /** Set once a chunk couldn't be stored (kept in memory instead). */
  storageError: unknown = null;
  private seq = 0;
  private bytes = 0;
  /** Stored chunk keys, or the chunk itself when storing failed — in order. */
  private parts: (string | Blob)[] = [];
  private chain: Promise<void>;

  constructor(mime: string, startedAt = Date.now()) {
    this.id = `rec-${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.mime = mime;
    this.startedAt = startedAt;
    this.chain = this.writeMeta().catch((e) => {
      this.storageError = e;
    });
  }

  get size(): number {
    return this.bytes;
  }

  private writeMeta() {
    const meta: RecordingMeta = {
      id: this.id,
      mime: this.mime,
      startedAt: this.startedAt,
      lastAt: Date.now(),
    };
    return idbPut(STORES.recording, metaKey(this.id), meta);
  }

  /** Queue a chunk; writes run strictly in order. */
  append(chunk: Blob) {
    if (!chunk.size) return;
    this.bytes += chunk.size;
    const key = chunkKey(this.id, this.seq++);
    const index = this.parts.push(key) - 1;
    this.chain = this.chain.then(async () => {
      try {
        await idbPutBlob(STORES.recording, key, chunk);
        if (this.seq % 10 === 0) await this.writeMeta();
      } catch (e) {
        this.storageError = e;
        this.parts[index] = chunk;
      }
    });
  }

  /** Waits for pending writes and returns the whole recording. */
  async finish(): Promise<Blob> {
    await this.chain;
    const parts: Blob[] = [];
    for (const p of this.parts) {
      if (typeof p !== "string") {
        parts.push(p);
        continue;
      }
      const b = await idbGetBlob(STORES.recording, p);
      if (b) parts.push(b);
    }
    return new Blob(parts, { type: this.mime.split(";")[0] });
  }

  /** Deletes the stored chunks (after the session holds the video). */
  async discard() {
    await this.chain;
    await discardRecording(this.id);
  }
}

export async function discardRecording(id: string) {
  const keys = (await idbKeys(STORES.recording)).filter((k) => k.startsWith(`${id}:`));
  for (const k of keys) await idbDelete(STORES.recording, k).catch(() => undefined);
}

export interface LeftoverRecording {
  id: string;
  startedAt: number;
  video: Blob;
}

/**
 * Recordings whose chunks were left behind (tab killed while recording, or
 * saving failed). Ones written to in the last `idleMs` are still live in
 * another tab and are skipped.
 */
export async function leftoverRecordings(idleMs = 30_000): Promise<LeftoverRecording[]> {
  const keys = (await idbKeys(STORES.recording)).sort();
  const out: LeftoverRecording[] = [];
  for (const mk of keys.filter((k) => k.endsWith(":meta"))) {
    const m = await idbGet<RecordingMeta>(STORES.recording, mk);
    if (!m) continue;
    if (Date.now() - m.lastAt < idleMs) continue;
    const chunkKeys = keys.filter((k) => k.startsWith(`${m.id}:`) && k !== metaKey(m.id));
    const parts: Blob[] = [];
    for (const k of chunkKeys) {
      const b = await idbGetBlob(STORES.recording, k);
      if (b) parts.push(b);
    }
    if (!parts.length) {
      await discardRecording(m.id);
      continue;
    }
    out.push({
      id: m.id,
      startedAt: m.startedAt,
      video: new Blob(parts, { type: m.mime.split(";")[0] }),
    });
  }
  return out;
}
