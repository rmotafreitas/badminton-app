.PHONY: dev dev-down dev-logs build up down logs \
        db-shell db-generate db-push db-seed install install-backend install-web clean dev-full

# ─────────────────────────────────────────────────────────────────────────────
#  DEV  — MongoDB + backend in Docker, frontend runs locally (best HMR)
# ─────────────────────────────────────────────────────────────────────────────
dev:
	docker compose -f docker-compose.dev.yml up -d --build
	@echo ""
	@echo "  → Backend:  https://localhost:3000"
	@echo "  → Start frontend locally:  cd web && bun dev"
	@echo ""

dev-full:
	docker compose -f docker-compose.dev.yml down
	docker compose -f docker-compose.dev.yml up -d --build
	cd backend && bunx --bun prisma generate && bunx --bun prisma db push && bun run db:seed
	@echo ""
	@echo "  → Backend:  https://localhost:3000"
	@echo "  → Start frontend locally:  cd web && bun dev"
	@echo ""

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.dev.yml logs -f

# ─────────────────────────────────────────────────────────────────────────────
#  PRODUCTION
# ─────────────────────────────────────────────────────────────────────────────
build:
	docker compose build

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

# ─────────────────────────────────────────────────────────────────────────────
#  DATABASE
# ─────────────────────────────────────────────────────────────────────────────
db-shell:
	docker compose -f docker-compose.dev.yml exec mongo mongosh

db-generate:
	cd backend && bunx --bun prisma generate

db-push:
	cd backend && bunx --bun prisma db push

db-studio:
	cd backend && bunx --bun prisma studio

db-seed:
	cd backend && bun run db:seed

# ─────────────────────────────────────────────────────────────────────────────
#  INSTALL
# ─────────────────────────────────────────────────────────────────────────────
install: install-backend install-web

install-backend:
	cd backend && bun install

install-web:
	cd web && bun install

# ─────────────────────────────────────────────────────────────────────────────
#  CLEAN
# ─────────────────────────────────────────────────────────────────────────────
clean:
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
