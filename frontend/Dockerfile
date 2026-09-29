# --- build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

# --- runtime stage (non-root nginx, listens on 8080 / optional 8443) --------
# We need `envsubst` and `sed` from busybox for the entrypoint. The
# `nginx-unprivileged` base already has both. We also need `gettext` for
# `envsubst` in case the alpine variant strips it — keep busybox default.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
USER root

# Wipe the stock default site — our rendered config goes in its place.
RUN rm -f /etc/nginx/conf.d/default.conf

# Copy the SPA, the security headers, and the BasicAuth + TLS snippets.
COPY --from=build                /app/dist                  /usr/share/nginx/html
COPY                             security-headers.conf      /etc/nginx/security-headers.conf
COPY                             nginx.basic-auth.conf      /etc/nginx/nginx.basic-auth.conf
COPY                             nginx.tls.conf             /etc/nginx/nginx.tls.conf
COPY                             nginx.conf.template        /etc/nginx/nginx.conf.template
COPY                             entrypoint.sh              /docker-entrypoint.d/40-render-config.sh

# The hook directory is the documented extension point for the unprivileged
# nginx image (it already runs everything in /docker-entrypoint.d/ before
# starting nginx). Make sure the script is executable for root.
RUN chmod +x /docker-entrypoint.d/40-render-config.sh

USER nginx

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=10s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1