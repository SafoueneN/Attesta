# syntax=docker/dockerfile:1.7
# Image du service letters-export : seul service à embarquer Chromium (docs/adr/0018). Contexte : la racine
# du dépôt, réduite par Dockerfile.dockerignore. Exécution avec le profil seccomp infra/seccomp/chromium.json
# (sandbox de Chromium active, docs/adr/0009).
#   docker build -f services/letters-export/Dockerfile -t attesta/letters-export .

FROM node:22-bookworm-slim AS build
WORKDIR /repo
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY packages/logger/package.json packages/logger/
COPY packages/logger/dist packages/logger/dist
COPY packages/config/package.json packages/config/
COPY packages/config/dist packages/config/dist
COPY packages/http-kit/package.json packages/http-kit/
COPY packages/http-kit/dist packages/http-kit/dist
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-schemas/dist packages/shared-schemas/dist
COPY packages/llm-client/package.json packages/llm-client/
COPY packages/llm-client/dist packages/llm-client/dist
WORKDIR /repo/services/letters-export
COPY services/letters-export/package.json services/letters-export/package-lock.json services/letters-export/.npmrc ./
# Cache npm partagé entre les builds, reprises réseau : une relance réutilise les paquets déjà téléchargés.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY services/letters-export/tsconfig.json services/letters-export/tsconfig.build.json ./
COPY services/letters-export/src src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
# Chromium et polices du système ; npm et npx retirés (inutiles à l'exécution, signalés par Trivy).
# Reprises apt : Chromium pèse une centaine de Mo, un réseau instable ne doit pas faire échouer le build.
RUN echo 'Acquire::Retries "8";' > /etc/apt/apt.conf.d/80-reprises \
  && apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
# Système de fichiers en lecture seule : Chromium écrit dans /tmp (tmpfs).
ENV NODE_ENV=production \
  PORT=4006 \
  HOME=/tmp \
  XDG_CONFIG_HOME=/tmp/.config \
  XDG_CACHE_HOME=/tmp/.cache \
  PUPPETEER_SKIP_DOWNLOAD=true \
  PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build --chown=root:root /repo/services/letters-export/package.json ./
COPY --from=build --chown=root:root /repo/services/letters-export/node_modules node_modules
COPY --from=build --chown=root:root /repo/services/letters-export/dist dist
COPY --chown=root:root services/letters-export/migrations migrations
COPY --chown=root:root services/letters-export/prompts prompts
COPY --chown=root:root services/letters-export/templates templates
USER node
EXPOSE 4006
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4006)+'/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
