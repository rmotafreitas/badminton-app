.PHONY: build test lint format dev start e2e

build:
	bun run build

test:
	bun test

lint:
	bun run lint

format:
	bun run format

dev:
	bun run dev

start:
	bun run start

e2e:
	docker-compose -f docker-compose.e2e.yml up --build --abort-on-container-exit newman
	docker-compose -f docker-compose.e2e.yml down
