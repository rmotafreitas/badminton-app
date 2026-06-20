# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM oven/bun:latest AS deps
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM oven/bun:latest AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun build src/index.ts --outdir dist --target bun

# ── Stage 3: production runner ────────────────────────────────────────────────
FROM oven/bun:latest AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3000
CMD ["bun", "dist/index.js"]
