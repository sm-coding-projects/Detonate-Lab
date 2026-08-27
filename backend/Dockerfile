# --- build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- runtime stage -----------------------------------------------------------
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# dumb-init for clean signal handling (PID 1)
RUN apk add --no-cache dumb-init

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist

# Writable quarantine dir (only used when RETAIN_BYTES=true); owned by node.
RUN mkdir -p /data/quarantine && chown -R node:node /data
USER node

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=4s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
