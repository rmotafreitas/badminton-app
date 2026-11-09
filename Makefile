# Front door only: every target runs a `bun run` script, so CI and machines without make use bun directly.
.PHONY: help dev up down reset install check test typecheck db-push db-seed-demo db-backfill-images db-recompute-elo build-web build-api prod-up prod-down

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[32m%-20s\033[0m %s\n", $$1, $$2}'

dev: install up ## Install, start Mongo + SeaweedFS, push the schema, run API + web
	bun run db:push
	bun run dev

up: ## Start local services (Mongo replica set, SeaweedFS)
	docker compose -f docker-compose.dev.yml up -d --wait

down: ## Stop local services
	docker compose -f docker-compose.dev.yml down

reset: ## Stop local services and DELETE their data
	docker compose -f docker-compose.dev.yml down -v

install: ## Install dependencies (generates the Prisma client)
	bun install

check: ## Typecheck + every small test (backend, architecture, web)
	bun run check

test: ## Small tests only
	bun run test

typecheck: ## TypeScript project references
	bun run typecheck

db-push: ## Sync the Prisma schema (indexes, new collections) to DATABASE_URL
	bun run db:push

db-seed-demo: ## DEV ONLY: 90 demo games per club, then ratings replayed
	bun run db:seed:demo

db-backfill-images: ## One-off after deploy: content versions for stored images
	bun run db:backfill-images

db-recompute-elo: ## Replay every club's games and rewrite ratings
	bun run db:recompute-elo

build-web: ## Production build of the web app
	bun run build:web

build-api: ## Vercel build output of the API
	bun run build:api

prod-up: ## Self-hosted production (Mongo + API + nginx web)
	docker compose up -d --build

prod-down:
	docker compose down
