# Rally Analysis

Record (or import) a badminton session on a phone and get, on the device:
player tracking (P1–P6) with a court map and distance covered, shot
detection with shot types, launch/average shuttle speed, apex, landing spot,
rally lengths — plus an overlay for playback and a shareable exported video.

Everything heavy runs **in the user's browser** (no GPU servers, no paid
inference). The backend only stores metadata, summaries and presigned links to
object storage.

## Architecture

```
web/src/rally/
  engine/                 pure analysis code (runs in workers)
    runtime/              InferenceRuntime port + ONNX Runtime Web adapter (WebGPU → WASM)
    models/               model registry/cache, YOLOX (people), TrackNetV3 (shuttle)
    geometry/             BWF court model, homography, single-view camera, court detection
    physics/              shuttle flight model (gravity + quadratic drag) + monocular fit
    tracking/             offline player tracker in court coordinates
    events/               shuttle track cleaning, hits, rallies, shot typing
    analysis/             analyze.ts pipeline + analysis.worker.ts
    live/                 live.worker.ts (camera preview + setup check)
    stats.ts, types.ts    derived stats, corrections, versioned AnalysisResult
  overlay/                theme tokens, frame state, widget-based renderer (live/playback/export)
  media/                  transcoder port (WebCodecs adapter), exporter, codec selection
  sessions/manager.ts     offline-first orchestration (IndexedDB, upload & analysis queues)
  storage/idb.ts          IndexedDB wrapper
  ui/                     pages + components (/analysis, /analysis/record, /analysis/:key)
  lab/                    /lab device benchmark + engine harness (internal)
backend/src/…/RallySession*   sessions API, S3/R2 presigning, analysis lock, retention
tools/models/                 reproducible model export (weights are not in git)
```

### Data flow

1. **Record** (`/analysis/record`, MediaRecorder, live overlay + setup check) or
   **import** a file. The session is stored locally (IndexedDB: metadata + video).
2. When online: registered on the server (idempotent on `clientId`); a 720p
   review copy is uploaded straight to object storage with a presigned PUT
   (transcoded on-device with WebCodecs only if needed).
3. **Court check** (seconds): background median + people's feet + court-line
   detection. Unless very confident, the session waits at "Check court" for one
   tap (or a corner drag).
4. **Analysis** (worker, ~3× clip length on a laptop iGPU; phones TBD): players
   ~10×/s (YOLOX, plus a zoomed far-half pass), shuttle every frame at ≤ 30 fps
   (TrackNetV3 on a 16:9 window above the court), then tracking, hits, physics
   fits, shot types, stats. Checkpointed; resumes after the app is closed.
5. Result saved locally; gzip'd full analysis uploaded to storage + compact
   summary to the API. Any logged-in device can play, review or (if not yet
   analysed) analyse it — a server lease lock prevents double work.
6. **Corrections** (shot type/hitter/false hits, label swaps, format) are stored
   separately and applied on top; stats are always recomputed from them.
7. **Export** renders the same overlay into an MP4 on-device and hands it to the
   share sheet / download. Nothing is stored server-side.

### Access

Owner and linked players: everything. Same-club members: summary stats only.
Nobody else. Linked players can remove themselves.

## Deploying

### 1. Object storage (Cloudflare R2, free tier)

1. Create a bucket (e.g. `badminton-rally`). R2 requires a payment method on
   the account even on the free tier (10 GB storage, free egress).
2. Create an **R2 API token** with Object Read & Write on that bucket.
3. Bucket → Settings → **CORS policy** (browsers upload/stream directly):

   ```json
   [
     {
       "AllowedOrigins": ["https://YOUR-APP-DOMAIN"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["content-type", "range"],
       "ExposeHeaders": ["content-length", "content-range", "etag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. Backend env (Vercel project of `backend/`):

   | Var | Value |
   | --- | --- |
   | `S3_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
   | `S3_REGION` | `auto` |
   | `S3_BUCKET` | your bucket |
   | `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | from the token |
   | `CRON_SECRET` | `openssl rand -hex 32` (daily retention cron) |

   Without `S3_*` the feature still works: sessions, stats and reviews sync,
   videos stay on the recording device ("Cloud storage not set up").

5. Push the Prisma schema: `cd backend && bun run db:push` (adds `RallySession`).

The backend build declares a daily Vercel Cron
(`/rally-sessions/maintenance/purge-videos`) that deletes review videos older
than 60 days unless pinned. Stats are kept forever.

### 2. Model files (~43 MB used by the app)

The app needs `yolox_tiny_humanart.onnx` and `tracknetv3_fp16.onnx` (the other
files are only used by `/lab`). Build them with `tools/models/fetch_models.sh`,
then host them on any CDN with CORS — e.g. a **public R2 bucket** (r2.dev or a
custom domain) with `GET` allowed from your app origin — and set in the `web/`
Vercel project:

```
VITE_MODEL_BASE_URL=https://models.YOUR-DOMAIN/   # trailing slash
```

Models download once per device and are kept in Cache Storage
(`rally-models-v1`, preserved across app updates by `sw.js`).

### 3. Web app

Nothing else: workers and the ONNX Runtime WASM (≈ 28 MB, fetched only when
analysis starts) are part of the normal Vite build.

## Limits & known limitations

- Phone must rest still (tripod / leaning); handheld footage breaks the
  single calibration. Higher is better (≥ 2 m): a low camera compresses the
  far half and its depth estimates.
- Values are estimates from one camera and shown with "~". Launch speed comes
  from a physics fit; confidence is reported per shot and only reviewed or
  confident speeds count toward records.
- Hit attribution in fast net exchanges and shot typing from unusual angles
  are the weakest parts — the review step exists for that; opt-in shared
  corrections are meant for future retraining.
- Players switching ends during a long session keep their P-labels by side;
  use "swap labels" corrections.
- No real-phone benchmark yet: run `/lab` on target phones (WebGPU required
  for practical speed; WASM works but is ~10× slower).

## Developing

```bash
docker compose -f docker-compose.dev.yml up -d mongo mongo-init seaweedfs seaweedfs-init
tools/models/fetch_models.sh            # models → web/public/models
cd backend && bun run db:push && bun dev
cd web && bun dev --host                # https://localhost:5173/analysis, /lab
cd web && bunx vitest run src/rally     # engine tests (geometry, physics, tracking, events)
```

`/lab` has the device benchmark, a full-engine run with manual corners, and a
raw-detection dump (`window.__rallyLastResult.debug`) for replaying the
tracking/events logic offline with Bun.
