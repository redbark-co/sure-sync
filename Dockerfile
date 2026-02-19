# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm build

# Stage 3: Production
FROM node:20-alpine AS runner
RUN apk add --no-cache tini
WORKDIR /app

COPY --from=builder /app/dist/main.cjs ./main.cjs
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production

# Use tini as init process for proper signal handling in Docker
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "main.cjs"]
