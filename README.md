# Badminton Buddy

Your club's games, ratings, training and on-device rally analysis. Bun monorepo: an Elysia API over MongoDB and a
React PWA (TanStack Router + Query, shadcn/ui), sharing typed contracts.

## Quick start

Prerequisites: **Bun 1.4.3**, **Docker**, **mkcert** (`mkcert -install` once, for local HTTPS).

```bash
cp .env.example .env          # local defaults; fill in Google/SMTP only if you need them
make dev                      # install, start Mongo + SeaweedFS, push the schema, run API + web
```

Open **https://localhost:5173**. Without SMTP/Twilio in development, sign-in codes and links are printed in the API
log. `make db-seed-demo` adds demo games to a local database.

| make | bun | |
|---|---|---|
| `make dev` | `bun run dev` | API (`127.0.0.1:3000/api`) + web (`https://localhost:5173`, proxies `/api`) |
| `make check` | `bun run check` | typecheck + unit, system and web tests |
| | `bun run test:integration` | adapters against real MongoDB, SeaweedFS, sharp (needs `make up`) |
| | `bun run test:e2e` | Playwright on the real stack, desktop + phone (needs `make up`) |
| | `bun run test:e2e:rally` | Rally Analysis on real footage and models (slow) |
| `make up` / `down` / `reset` | | local services (reset deletes data) |
| `make db-push` | `bun run db:push` | sync Prisma schema and indexes |
| `make db-backfill-images` | `bun run db:backfill-images` | one-off after deploying the image routes |
| `make db-recompute-elo` | `bun run db:recompute-elo` | replay every club's ratings |

## Deploy (Vercel)

Two projects from this repository:

- **API**: root directory `apps/api` (its `vercel.json` installs from the repo root and builds the Build Output API).
  Env: `DATABASE_URL`, `APP_URL` (the web origin), `GOOGLE_CLIENT_ID`, `SMTP_*`, `TWILIO_*`, `S3_*`, `CRON_SECRET`,
  `ENABLE_REGISTRATION`, and `API_REGION` (e.g. `dub1`, `fra1`, `cdg1`: the Vercel region closest to your MongoDB
  Atlas cluster; every request makes several database round trips). Keep **Fluid compute** on (project settings →
  Functions) so warm instances are reused. A daily cron (`/api/maintenance/daily`) purges expired videos, sessions, codes and rate-limit
  windows; uptime checks can use `/api/health/ready` (503 when MongoDB doesn't answer). To keep the API warm, point a free
  uptime monitor (UptimeRobot, cron-job.org) at `/api/health/ready` every 5 minutes; the app is built to stay usable
  through a cold start anyway (see "A sleeping API never blocks the UI" in docs/architecture.md).
- **Web**: root directory `apps/web`. Env: `API_URL` (the API deployment's origin), `VITE_GOOGLE_CLIENT_ID`,
  `VITE_MODEL_BASE_URL`. The browser calls `/api` on the web origin; Vercel rewrites it to `${API_URL}/api/…`.

After the first deploy of this version: `bun run db:push` (new collections and indexes) and
`bun run db:backfill-images`. Everyone signs in once more (sessions replaced the JWT cookies).

Self-hosting instead: `make prod-up` (Mongo + API + nginx serving the web app and proxying `/api`).

## Layout and rules

Testing tiers: [docs/testing.md](docs/testing.md). See [docs/architecture.md](docs/architecture.md) for the layers, the caching strategy and how to add a use case, route
or page. Rally Analysis (the on-device CV engine): [docs/rally-analysis.md](docs/rally-analysis.md).
