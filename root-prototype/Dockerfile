FROM node:24-bookworm-slim

WORKDIR /app
RUN chown node:node /app

USER node
COPY --chown=node:node . .
RUN npm ci --ignore-scripts
RUN npm run build

ENV NODE_ENV=development
EXPOSE 5173
