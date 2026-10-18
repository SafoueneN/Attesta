# syntax=docker/dockerfile:1.7
# Image du service profiles. Contexte de construction : la racine du dépôt, réduite par
# Dockerfile.dockerignore au dossier du service et aux paquets partagés (docs/adr/0023).
#   docker build -f services/profiles/Dockerfile -t attesta/profiles .

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY packages/logger/package.json packages/logger/
COPY packages/logger/dist packages/logger/dist
COPY packages/config/package.json packages/config/
COPY packages/config/dist packages/config/dist
COPY packages/http-kit/package.json packages/http-kit/
COPY packages/http-kit/dist packages/http-kit/dist
WORKDIR /repo/services/profiles
COPY services/profiles/package.json services/profiles/package-lock.json services/profiles/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY services/profiles/tsconfig.json services/profiles/tsconfig.build.json ./
COPY services/profiles/src src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
# npm et npx sont inutiles à l'exécution (et signalés par Trivy).
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production \
  PORT=4002
WORKDIR /app
COPY --from=build --chown=root:root /repo/services/profiles/package.json ./
COPY --from=build --chown=root:root /repo/services/profiles/node_modules node_modules
COPY --from=build --chown=root:root /repo/services/profiles/dist dist
USER node
EXPOSE 4002
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4002)+'/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
