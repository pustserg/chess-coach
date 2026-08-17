# syntax=docker/dockerfile:1

# ---------- deps: install workspace dependencies ----------
FROM node:24-alpine AS deps
RUN npm install -g pnpm@10.15.0
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---------- build: compile the Next.js app ----------
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.15.0
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter web build

# ---------- runner: production server ----------
FROM node:24-alpine AS runner
RUN npm install -g pnpm@10.15.0
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/public apps/web/public

EXPOSE 3000
CMD ["pnpm", "--filter", "web", "start"]
