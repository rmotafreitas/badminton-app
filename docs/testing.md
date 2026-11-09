# Testing

Four tiers, cheapest first. `make check` runs the first two plus the web tests and is what every change must pass;
CI (`.github/workflows/ci.yml`) also runs integration and end-to-end.

| Tier | Where | Runs against | Command | Time |
|---|---|---|---|---|
| **Unit** | `tests/unit/` (domain rules, use cases), `apps/web/src/**/*.test.ts` (client logic, rally engine) | in-memory fakes (`@bb/testing`), no I/O | `bun run test` | ~2 s |
| **System** | `tests/system/` | the whole API in-process (`buildApp` + real use cases + fakes), through the typed Eden client | `bun run test` | ~1 s |
| **Integration** | `tests/integration/*.integration.test.ts` | real MongoDB (a fresh database per file), SeaweedFS (S3), sharp, and the production wiring behind HTTP | `bun run test:integration` (needs `make up`) | ~10 s |
| **End-to-end** | `e2e/specs/` (Playwright) | the real stack in a browser: API on :3100 with database `bb_e2e`, web on https://localhost:5180, Mailpit for emails | `bun run test:e2e` (needs `make up`) | ~1.5 min |
| **E2E: Rally CV** | `e2e/specs/rally.spec.ts` | real footage through the real ONNX models on-device, export to MP4, upload to S3 | `bun run test:e2e:rally` | minutes |

## What each tier is for

- **Unit:** business rules and authorization (who may see/change a game, a club, a session; ratings; input rules;
  rate limits; sign-in edge cases). Fakes are plain objects, so a rule is tested without a database.
- **System:** the HTTP contract: status codes, error bodies, cookies, CSRF, `no-store`, security headers, and a sweep
  that calls **every registered route** anonymously and expects 401 (or a 422 schema rejection) — a new route can't ship
  unauthenticated by accident.
- **Integration:** what fakes can't prove: unique indexes, compare-and-set updates under concurrency (sign-in codes,
  analysis lock, rate limiter), `$transaction`, Prisma field mapping, presigned S3 URLs actually working, sharp output.
- **End-to-end:** user journeys — sign-in (password and a real emailed code), register/edit/delete games with ratings
  following, training log, profile photo and its immutable caching, contact-detail privacy, clubs admin, dark mode and
  Portuguese, offline banner, the phone layout (action sheet, tap-only score entry, live score keeping, the install
  guide), and Rally Analysis on real video.

## Rally Analysis E2E: what to expect

Without a GPU (CI, headless Chromium) the models run on single-threaded WASM: an 8-second clip takes ~20 minutes, the
30-second sample over 40. `global-setup` cuts the 8 s fixture with ffmpeg; it proves the whole pipeline (court check,
player tracking, the overlay, cloud upload, export to MP4) but holds no complete rally. On a GPU machine run the full
clip with the rally and shot checks:

```bash
RALLY_VIDEO=apps/web/public/lab/sample.mp4 RALLY_EXPECT_SHOTS=1 bun run test:e2e:rally
```

Don't edit `apps/web` while it runs: Vite's hot reload restarts the page mid-analysis.

## Conventions

- A bug fix comes with the test that would have caught it.
- Security-sensitive behaviour needs a negative test (another club, another user, no session, wrong role).
- E2E specs create what they need (no reliance on another spec having run); `global-setup` resets `bb_e2e` each run.
- E2E specs save screenshots of the key screens to `e2e/screenshots/` (CI uploads them with the HTML report).
