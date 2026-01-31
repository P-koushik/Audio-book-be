# syntax=docker/dockerfile:1
ARG NODE_VERSION=22.17.0

# ---------- Build stage ----------
FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- Runtime stage ----------
FROM node:${NODE_VERSION}-alpine
ENV NODE_ENV=production
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled JS output
COPY --from=builder /usr/src/app/.dist ./.dist

# If you use any runtime files (firebase json, templates, etc) copy them too:
# COPY --from=builder /usr/src/app/<some-file-or-folder> ./<same>

USER node
EXPOSE 5000
CMD ["node", ".dist/index.js"]
