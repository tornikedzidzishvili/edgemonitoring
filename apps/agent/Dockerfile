FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json* tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/agent/package.json ./apps/agent/package.json
RUN npm ci

COPY apps/agent/tsconfig.json ./apps/agent/tsconfig.json
COPY apps/agent/src ./apps/agent/src
RUN npm run build -w @edge-monitoring/agent

FROM node:20-alpine
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/agent/dist ./apps/agent/dist

CMD ["node", "apps/agent/dist/index.js"]
