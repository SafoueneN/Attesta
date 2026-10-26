# syntax=docker/dockerfile:1.7
# Image du service jobs-matching. Contexte de construction : la racine du dépôt, réduite par
# Dockerfile.dockerignore au dossier du service et aux paquets partagés (docs/adr/0023).
#   docker build -f services/jobs-matching/Dockerfile -t attesta/jobs-matching .

FROM node:22-bookworm-slim AS build
WORKDIR /repo
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
WORKDIR /repo/services/jobs-matching
COPY services/jobs-matching/package.json services/jobs-matching/package-lock.json services/jobs-matching/.npmrc ./
# Cache npm partagé entre les builds, reprises réseau : une relance réutilise les paquets déjà téléchargés.
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund --fetch-retries=5 --fetch-retry-maxtimeout=120000
COPY services/jobs-matching/tsconfig.json services/jobs-matching/tsconfig.build.json ./
COPY services/jobs-matching/src src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production \
  PORT=4004
WORKDIR /app
COPY --from=build --chown=root:root /repo/services/jobs-matching/package.json ./
COPY --from=build --chown=root:root /repo/services/jobs-matching/node_modules node_modules
COPY --from=build --chown=root:root /repo/services/jobs-matching/dist dist
COPY --chown=root:root services/jobs-matching/migrations migrations
COPY --chown=root:root services/jobs-matching/prompts prompts
COPY --chown=root:root services/jobs-matching/data data
USER node
EXPOSE 4004
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4004)+'/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
