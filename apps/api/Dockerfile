# Build a partir da raiz do repositório:
#   docker build -f apps/api/Dockerfile -t vida-publica-api .
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @vida-publica/api...
COPY apps/api apps/api
RUN pnpm --filter @vida-publica/api run build \
 && pnpm --filter @vida-publica/api deploy --legacy --prod /out \
 && cp -r apps/api/dist /out/dist

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
