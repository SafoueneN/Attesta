# syntax=docker/dockerfile:1.7
# Image unique d'Attesta : compilation TypeScript, puis exécution non-root avec
# Chromium et polices système (rendu PDF). Lancer avec --init (cf. compose.yaml).

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/shared/package.json packages/shared/
COPY packages/render/package.json packages/render/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npx tsc -b && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
# Correctifs de sécurité Debian, Chromium et polices. npm et npx sont retirés :
# inutiles à l'exécution, ils apportaient des vulnérabilités (scan Trivy en CI).
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Système de fichiers en lecture seule à l'exécution : Chromium écrit dans /tmp (tmpfs).
ENV NODE_ENV=production \
  PORT=3000 \
  HOME=/tmp \
  XDG_CONFIG_HOME=/tmp/.config \
  XDG_CACHE_HOME=/tmp/.cache \
  PUPPETEER_SKIP_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build --chown=root:root /app/package.json /app/package-lock.json ./
COPY --from=build --chown=root:root /app/node_modules node_modules
COPY --from=build --chown=root:root /app/packages packages
COPY --from=build --chown=root:root /app/apps apps
COPY --chown=root:root db db
COPY --chown=root:root prompts prompts
# Code en lecture seule pour l'utilisateur d'exécution.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/dist/server.js"]
