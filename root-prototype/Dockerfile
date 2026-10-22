FROM node:24-bookworm-slim AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app

USER node
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node persona/package.json ./persona/package.json
COPY --chown=node:node networking/package.json ./networking/package.json
COPY --chown=node:node networking/gen/client/package.json ./networking/gen/client/package.json
COPY --chown=node:node networking/gen/server/package.json ./networking/gen/server/package.json
COPY --chown=node:node networking/gen/shared/package.json ./networking/gen/shared/package.json
COPY --chown=node:node server/package.json ./server/package.json
COPY --chown=node:node community-bot/package.json ./community-bot/package.json
COPY --chown=node:node client/package.json ./client/package.json
RUN npm ci --ignore-scripts
# Use the N-API prebuild when available and compile sqlite3 for this ARM64 runtime otherwise.
RUN npm rebuild sqlite3
COPY --chown=node:node . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
RUN chown node:node /app
COPY --from=build --chown=node:node /app/ ./

ENV NODE_ENV=development
USER node
EXPOSE 5173
