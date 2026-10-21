# syntax=docker/dockerfile:1.7
# Image de la gateway. Contexte : la racine du dépôt, réduite par Dockerfile.dockerignore.
#   docker build -f gateway/Dockerfile -t attesta/gateway .

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY packages/logger/package.json packages/logger/
COPY packages/logger/dist packages/logger/dist
COPY packages/config/package.json packages/config/
COPY packages/config/dist packages/config/dist
COPY packages/http-kit/package.json packages/http-kit/
COPY packages/http-kit/dist packages/http-kit/dist
WORKDIR /repo/gateway
COPY gateway/package.json gateway/package-lock.json gateway/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY gateway/tsconfig.json gateway/tsconfig.build.json ./
COPY gateway/src src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
RUN apt-get update \
  && apt-get upgrade -y --no-install-recommends \
  && rm -rf /var/lib/apt/lists/* /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
ENV NODE_ENV=production \
  PORT=4000
WORKDIR /app
COPY --from=build --chown=root:root /repo/gateway/package.json ./
COPY --from=build --chown=root:root /repo/gateway/node_modules node_modules
COPY --from=build --chown=root:root /repo/gateway/dist dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/ready').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/server.js"]
