# Build context: the repository root (docker compose sets it).
FROM oven/bun:1.4.3 AS build
WORKDIR /src
COPY . .
RUN bun install --frozen-lockfile --ignore-scripts
# One bundled file + only the runtime npm dependencies + a Prisma client for this image's platform.
RUN bun apps/api/scripts/bundle.ts --entry src/main.ts --out /app --target bun

FROM oven/bun:1.4.3-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
USER bun
EXPOSE 3000
CMD ["bun", "index.js"]
