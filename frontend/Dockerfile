# syntax=docker/dockerfile:1.7
# Image du frontend : build Vite, puis nginx non-root (port 8080). Contexte : la racine du dépôt, réduite par
# Dockerfile.dockerignore au dossier du frontend et aux contrats partagés compilés.
#   docker build -f frontend/Dockerfile -t attesta/frontend .

FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY packages/shared-schemas/package.json packages/shared-schemas/
COPY packages/shared-schemas/dist packages/shared-schemas/dist
WORKDIR /repo/frontend
COPY frontend/package.json frontend/package-lock.json frontend/.npmrc ./
RUN npm ci --no-audit --no-fund
COPY frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/public public
COPY frontend/src src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY --chown=root:root frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=root:root frontend/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build --chown=root:root /repo/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=5 CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080/health"]
