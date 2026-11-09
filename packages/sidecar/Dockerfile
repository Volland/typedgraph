# Build from the repository root:
#   docker build -f packages/sidecar/Dockerfile -t obsigraph-sidecar .
FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/node-vault/package.json packages/node-vault/
COPY packages/plugin/package.json packages/plugin/
COPY packages/sidecar/package.json packages/sidecar/
RUN npm ci --workspace @obsigraph/sidecar --include-workspace-root --ignore-scripts
COPY packages/core packages/core
COPY packages/node-vault packages/node-vault
COPY packages/sidecar packages/sidecar
RUN npm run build -w @obsigraph/sidecar

FROM node:22-slim
ENV NODE_ENV=production \
    OBSIGRAPH_VAULT=/vault \
    OBSIGRAPH_DATA=/data \
    OBSIGRAPH_HOST=0.0.0.0 \
    OBSIGRAPH_PORT=8765
WORKDIR /app
COPY --from=build /src/packages/sidecar/dist/server.mjs ./server.mjs
RUN mkdir -p /vault /data && chown node:node /data
USER node
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:8765/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.mjs"]
