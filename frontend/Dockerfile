# syntax=docker/dockerfile:1
# ---------- build the SPA ----------
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- serve with hardened, non-root nginx ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
# Runs as uid 101 (nginx), listens on 8080 by default.
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
