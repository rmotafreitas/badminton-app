# Build context: the repository root (docker compose sets it).
FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_MODEL_BASE_URL
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID VITE_MODEL_BASE_URL=$VITE_MODEL_BASE_URL IN_DEV=docker
RUN bun run --cwd apps/web build

FROM nginx:1.29-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
