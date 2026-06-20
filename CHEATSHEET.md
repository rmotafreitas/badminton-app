# Dev Cheat Sheet

## First-time setup

```bash
# 1 — install mkcert (once per machine)
brew install mkcert nss
mkcert -install

# 2 — copy env files and fill in values
cp .env.example .env
cp backend/.env.example backend/.env
cp web/.env.example web/.env

# 3 — install all deps
make install

# 4 — generate Prisma client
make db-generate
```

---

## Daily dev workflow

| Goal                             | Command             |
| -------------------------------- | ------------------- |
| Start MongoDB + backend          | `make dev`          |
| Start frontend (local, with HMR) | `cd web && bun dev` |
| Stop MongoDB + backend           | `make dev-down`     |
| Stream backend logs              | `make dev-logs`     |
| Open Mongo shell                 | `make db-shell`     |

Backend → `https://localhost:3000`
Frontend → `https://localhost:5173`
API proxy → Vite rewrites `/api/*` → `https://localhost:3000/*`

---

## Database

| Goal                           | Command            |
| ------------------------------ | ------------------ |
| Push schema changes to MongoDB | `make db-push`     |
| Re-generate Prisma client      | `make db-generate` |
| Open Prisma Studio (GUI)       | `make db-studio`   |

---

## Production

| Goal                    | Command      |
| ----------------------- | ------------ |
| Build all Docker images | `make build` |
| Start full stack        | `make up`    |
| Stop full stack         | `make down`  |
| Stream all logs         | `make logs`  |

---

## Local HTTPS — how it works

### Backend — `elysia-local-https`

`elysia-local-https` wraps the Elysia `listen()` call. On first run it:

1. runs `mkcert -install` (prompts sudo once)
2. generates `certs/local/localhost.pem` + `certs/local/localhost-key.pem`
3. auto-refreshes certs when < 14 days from expiry

Controlled by env vars:

```
ENABLE_LOCAL_HTTPS=true   # default: true when NODE_ENV != production
HTTPS_CERT_PATH=certs/local/localhost.pem
HTTPS_KEY_PATH=certs/local/localhost-key.pem
```

Inside Docker, `ENABLE_LOCAL_HTTPS` is set to `false` — plain HTTP, with TLS terminated at the nginx reverse proxy in prod.

### Frontend — `vite-plugin-mkcert`

Added to `vite.config.ts` as `mkcert()` in the `plugins` array. The plugin:

1. detects if mkcert is installed
2. generates/reuses trusted certs for `localhost`
3. injects them into Vite's dev-server HTTPS config automatically

No `server.https: true` needed — the plugin covers it.

---

## Path aliases

Both projects support `@/` imports pointing to their respective `src/` directories.

```ts
// backend — instead of:
import { PrismaUserRepo } from "../../infrastructure/db/PrismaUserRepo";
// use:
import { PrismaUserRepo } from "@/infrastructure/db/PrismaUserRepo";

// web — instead of:
import { AuthServiceImpl } from "../../core/services/auth-service";
// use:
import { AuthServiceImpl } from "@/core/services/auth-service";
```

Configured in:

- `backend/tsconfig.json` → `paths: { "@/*": ["./src/*"] }`
- `web/tsconfig.app.json` → `paths: { "@/*": ["./src/*"] }`
- `web/vite.config.ts` → `resolve.alias: { "@": "./src" }`

---

## Troubleshooting

| Problem                                               | Fix                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| `UNABLE_TO_VERIFY_LEAF_SIGNATURE` in Vite proxy       | Expected — browser trusts mkcert CA but Node doesn't. Set `secure: false` in the proxy config (already done). |
| `mkcert: command not found`                           | `brew install mkcert nss && mkcert -install`                                                                  |
| Prisma `Environment variable not found: DATABASE_URL` | Make sure `backend/.env` exists and has `DATABASE_URL` set.                                                   |
| Backend starts on HTTP instead of HTTPS               | Check `ENABLE_LOCAL_HTTPS=true` in `backend/.env` and that certs exist in `backend/certs/local/`.             |
| Port 3000 already in use                              | `lsof -ti:3000                                                                                                | xargs kill` |
| Port 5173 already in use                              | `lsof -ti:5173                                                                                                | xargs kill` |
