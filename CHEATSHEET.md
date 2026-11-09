# Dev Cheat Sheet

## First-time setup

```bash
brew install mkcert nss && mkcert -install   # once per machine (Linux: your package manager)
cp .env.example .env                         # one .env at the root, read by the API and the web app
make dev                                     # install, services, schema, API + web
```

`make up` starts only Mongo (replica set, no auth) + SeaweedFS (local S3 stand-in for R2); then `bun run dev` runs the
API on `127.0.0.1:3000` and the web app on `https://localhost:5173` (it proxies `/api`, so cookies are first-party).

`scripts/seed.ts` has its `main()` call commented out on purpose (it wipes the DB).
Seeded password login: `admin@email.local` / `password`. `make db-seed-demo` adds demo games (local DB only).

### Object storage (Rally Analysis videos)

| Env              | Service                  | Endpoint                                     |
| ---------------- | ------------------------ | -------------------------------------------- |
| Dev              | SeaweedFS (`seaweedfs`)  | `http://localhost:8333`, bucket `rally-dev`  |
| Prod             | Cloudflare R2            | `https://<account-id>.r2.cloudflarestorage.com` |

Dev credentials live in `infra/seaweedfs/s3.json` (local only). The API reads `S3_*` from the root `.env`.
Videos never pass through the API: it presigns PUT/GET URLs and the browser talks to storage directly
(the R2 bucket needs a CORS rule for the app origin). A daily Vercel Cron purges expired videos (`CRON_SECRET`).

---

## Daily dev workflow

| Goal                                   | Command                  |
| -------------------------------------- | ------------------------ |
| Everything (services, schema, API+web) | `make dev`               |
| Only the services                      | `make up` / `make down`  |
| API + web against running services     | `bun run dev`            |
| Typecheck + all tests                  | `make check`             |
| Mongo shell                            | `docker compose -f docker-compose.dev.yml exec mongo mongosh app` |

API → `http://127.0.0.1:3000/api` · Web → `https://localhost:5173` (Vite proxies `/api` with the path kept).

## Database

| Goal                                   | Command                    |
| -------------------------------------- | -------------------------- |
| Push schema (collections, indexes)     | `make db-push`             |
| Prisma Studio                          | `bun run db:studio`        |
| Demo games (local DB only)             | `make db-seed-demo`        |
| Content versions for stored images     | `make db-backfill-images`  |
| Replay every club's ratings            | `make db-recompute-elo`    |

## Production (self-hosted)

`make prod-up` builds and starts Mongo + API + nginx (web build, `/api` proxy). Vercel: see the README.

## Imports

`@/x` is the current package's `src/x`; other packages are `@bb/<name>`; `../` is not allowed
(`tests/architecture.test.ts`). The web app sees only `@bb/contracts` and the API's type.

## Troubleshooting

| Problem                                   | Fix                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `Invalid environment` on API start        | The message lists the missing/invalid variables (`packages/config`).        |
| `mkcert: command not found`               | Install mkcert, then `mkcert -install`.                                     |
| 403 "Cross-origin request refused"        | `APP_URL` must be the exact origin you open the web app on.                 |
| Signed out after upgrading                | Expected once: sessions replaced the old JWT cookies.                       |
| Photos missing after deploy               | Run `make db-backfill-images` against that database.                        |
| Port 3000 / 5173 in use                   | `lsof -ti:3000 \| xargs kill`                                               |
