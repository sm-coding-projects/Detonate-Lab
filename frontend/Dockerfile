# --- build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# --- runtime stage (non-root nginx, listens on 8080) -------------------------
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
USER root
RUN rm -f /etc/nginx/conf.d/default.conf
COPY nginx.conf            /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1
